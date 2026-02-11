from functools import wraps
import re
from flask import Flask, redirect, request, jsonify, send_from_directory, render_template, session
from flask_cors import CORS
from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime, UTC
from werkzeug.utils import secure_filename
import random
import hashlib
import os
import tempfile
from dotenv import load_dotenv

load_dotenv()
MONGO_URI = os.environ.get("MONGO_URI")
SIMULATOR_SUBJECT = "Simulador"
DEFAULT_SIMULATOR_TIME = 30
SIMULATOR_SECTION_ORDER = [
    "Matemáticas",
    "Español",
    "Química",
    "Biología",
    "Pre-medicina",
    "Física",
    "Historia",
    "Geografía",
    "Arte"
]
SIMULATOR_SECTION_ALIASES = {
    "mate": "Matemáticas",
    "matematicas": "Matemáticas",
    "matemáticas": "Matemáticas",
    "espanol": "Español",
    "español": "Español",
    "quimica": "Química",
    "química": "Química",
    "biologia": "Biología",
    "biología": "Biología",
    "pre medicina": "Pre-medicina",
    "pre-medicina": "Pre-medicina",
    "premedicina": "Pre-medicina",
    "fisica": "Física",
    "física": "Física",
    "historia": "Historia",
    "geografia": "Geografía",
    "geografía": "Geografía",
    "arte": "Arte"
}
_pix2text_instance = None

# ========== CONFIGURACIÓN DE LA APLICACIÓN ==========
app = Flask(__name__)
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg'}
UPLOAD_FOLDER = os.path.join(app.root_path, 'static', 'img')

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
CORS(app)
app.config['SECRET_KEY'] = os.getenv("SECRET_KEY")

# ========== CONEXIÓN A MONGODB ==========
client = MongoClient(MONGO_URI)
db = client['preguntas']
questions_collection = db['matematicas']
users_collection = db['usuarios']
simulators_collection = db['simuladores']
simulator_scores_collection = db['simulator_scores']
simulator_attempts_collection = db['simulator_attempts']

# ========== FUNCIONES HELPER ==========
# Crear carpeta si no existe
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def hash_password(password):
    """Encripta una contraseña usando SHA-256"""
    return hashlib.sha256(password.encode()).hexdigest()

def jsonify_user(user):
    """Convierte ObjectId a string para un usuario"""
    if user and '_id' in user:
        user['_id'] = str(user['_id'])
    return user

def jsonify_question(question):
    """Convierte ObjectId a string para una pregunta"""
    if question and '_id' in question:
        question['_id'] = str(question['_id'])
    if question and question.get('image'):
        image_name = str(question.get('image')).strip()
        image_path = os.path.join(app.config['UPLOAD_FOLDER'], image_name)
        # Evita 404 en frontend cuando el registro apunta a una imagen inexistente.
        if not os.path.exists(image_path):
            question['image'] = ''
    return question

def ensure_simulator(name):
    if not name or not str(name).strip():
        return
    simul = simulators_collection.find_one({'name': name})
    if not simul:
        simulators_collection.insert_one({
            'name': name,
            'time_limit': DEFAULT_SIMULATOR_TIME,
            'enabled_from': None,
            'enabled_until': None,
            'force_enabled': False,
            'created_at': datetime.now(UTC),
            'updated_at': datetime.now(UTC)
        })

def parse_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ('1', 'true', 'yes', 'on', 'si', 's')
    return bool(value)

def normalize_simulator_section(value):
    raw = (value or '').strip()
    if not raw:
        return ''
    normalized_key = raw.lower()
    normalized_key = re.sub(r'\s+', ' ', normalized_key)
    return SIMULATOR_SECTION_ALIASES.get(normalized_key, raw)

def simulator_section_sort_key(question):
    section = normalize_simulator_section(question.get('simulator_subject'))
    order_map = {name: idx for idx, name in enumerate(SIMULATOR_SECTION_ORDER)}
    rank = order_map.get(section, len(SIMULATOR_SECTION_ORDER))
    created = question.get('created_at') or datetime.min.replace(tzinfo=UTC)
    if created.tzinfo is None:
        created = created.replace(tzinfo=UTC)
    return (rank, section.lower(), created)

def normalize_section_stats(raw_section_stats):
    normalized = {}
    if not isinstance(raw_section_stats, dict):
        return normalized
    for key, value in raw_section_stats.items():
        section = normalize_simulator_section(key)
        if not section:
            continue
        if isinstance(value, dict):
            correct = int(value.get('correct', 0) or 0)
            total = int(value.get('total', 0) or 0)
        else:
            correct = 0
            total = 0
        if correct < 0:
            correct = 0
        if total < 0:
            total = 0
        if correct > total:
            correct = total
        normalized[section] = {
            'correct': correct,
            'total': total
        }
    return normalized

def parse_local_datetime_to_utc(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return None
    if dt.tzinfo is None:
        local_tz = datetime.now().astimezone().tzinfo
        dt = dt.replace(tzinfo=local_tz)
    return dt.astimezone(UTC)

def datetime_to_iso_utc(value):
    if not value:
        return None
    dt = value
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    else:
        dt = dt.astimezone(UTC)
    return dt.isoformat().replace('+00:00', 'Z')

def is_simulator_enabled(simul, now_utc=None):
    if not simul:
        return True
    if parse_bool(simul.get('force_enabled'), False):
        return True
    now = now_utc or datetime.now(UTC)
    start = simul.get('enabled_from')
    end = simul.get('enabled_until')
    if start and start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    if end and end.tzinfo is None:
        end = end.replace(tzinfo=UTC)
    if start and now < start:
        return False
    if end and now > end:
        return False
    return True

def get_pix2text():
    global _pix2text_instance
    if _pix2text_instance is None:
        try:
            from pix2text import Pix2Text
        except Exception as exc:
            raise RuntimeError(
                "Pix2Text no está instalado. Agrega 'pix2text' a requirements.txt y ejecuta pip install -r requirements.txt"
            ) from exc
        _pix2text_instance = Pix2Text()
    return _pix2text_instance

def normalize_pix2text_output(result):
    if isinstance(result, str):
        return result
    if isinstance(result, dict):
        return result.get('text') or result.get('latex') or str(result)
    if isinstance(result, list):
        parts = []
        for item in result:
            if isinstance(item, dict):
                parts.append(item.get('text') or item.get('latex') or '')
            else:
                parts.append(str(item))
        return ''.join(parts)
    return str(result)

# ========== DECORADORES DE AUTENTICACIÓN ==========
def login_required(f):
    """Decorador para verificar autenticación"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({
                'success': False,
                'error': 'Autenticación requerida'
            }), 401
        return f(*args, **kwargs)
    return decorated_function

def maestro_required(f):
    """Decorador para verificar rol de maestro"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({
                'success': False,
                'error': 'Autenticación requerida'
            }), 401
        
        if session.get('user_role') != 'maestro':
            return jsonify({
                'success': False,
                'error': 'Acceso denegado: Se requiere rol de maestro'
            }), 403
        
        return f(*args, **kwargs)
    return decorated_function

# ========== RUTAS DE AUTENTICACIÓN ==========
@app.route('/api/register', methods=['POST'])
@maestro_required
def register_user():
    """Registra un nuevo alumno (solo maestro)"""
    try:
        data = request.get_json() or {}

        # Validar campos requeridos
        required_fields = ['nombre', 'apellido', 'email', 'password', 'grupo']
        for field in required_fields:
            if not data.get(field):
                return jsonify({
                    'success': False,
                    'error': f'El campo {field} es requerido'
                }), 400

        if data.get('rol') and data.get('rol') != 'alumno':
            return jsonify({
                'success': False,
                'error': 'Solo se permite registrar usuarios con rol alumno'
            }), 400

        # Verificar si el email ya existe
        existing_user = users_collection.find_one({'email': data['email']})
        if existing_user:
            return jsonify({
                'success': False,
                'error': 'El email ya está registrado'
            }), 400

        # Crear documento de usuario
        user_doc = {
            'nombre': data['nombre'],
            'apellido': data['apellido'],
            'email': data['email'],
            'password': hash_password(data['password']),
            'grupo': data['grupo'],
            'rol': 'alumno',
            'created_at': datetime.now(UTC)
        }

        # Insertar en MongoDB
        result = users_collection.insert_one(user_doc)

        return jsonify({
            'success': True,
            'message': 'Alumno registrado exitosamente',
            'user': {
                '_id': str(result.inserted_id),
                'nombre': data['nombre'],
                'apellido': data['apellido'],
                'email': data['email'],
                'grupo': data['grupo'],
                'rol': 'alumno'
            }
        }), 201

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login_user():
    """Inicia sesión de usuario"""
    try:
        data = request.get_json()
        
        # Validar campos
        if not data.get('email') or not data.get('password'):
            return jsonify({
                'success': False,
                'error': 'Email y contraseña son requeridos'
            }), 400
        
        # Buscar usuario
        user = users_collection.find_one({'email': data['email']})
        if not user:
            return jsonify({
                'success': False,
                'error': 'Usuario no encontrado'
            }), 404
        
        # Verificar contraseña
        if user['password'] != hash_password(data['password']):
            return jsonify({
                'success': False,
                'error': 'Contraseña incorrecta'
            }), 401
        
        # Crear sesión
        session['user_id'] = str(user['_id'])
        session['user_email'] = user['email']
        session['user_role'] = user['rol']
        session['user_name'] = f"{user['nombre']} {user['apellido']}"
        
        return jsonify({
            'success': True,
            'message': 'Login exitoso',
            'user': jsonify_user(user)
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/logout', methods=['POST'])
def logout_user():
    """Cierra la sesión del usuario"""
    session.clear()
    return jsonify({
        'success': True,
        'message': 'Logout exitoso'
    })

@app.route('/api/current-user', methods=['GET'])
def get_current_user():
    """Obtiene información del usuario actual"""
    if 'user_id' not in session:
        return jsonify({
            'success': False,
            'error': 'No autenticado'
        }), 401
    
    user = users_collection.find_one({'_id': ObjectId(session['user_id'])})
    if not user:
        session.clear()
        return jsonify({
            'success': False,
            'error': 'Usuario no encontrado'
        }), 404
    
    return jsonify({
        'success': True,
        'user': jsonify_user(user)
    })

@app.route('/api/students', methods=['GET'])
@maestro_required
def get_students():
    """Obtiene alumnos con filtro opcional por grupo"""
    try:
        group = (request.args.get('group') or '').strip()
        query = {'rol': 'alumno'}
        if group and group != 'todos':
            query['grupo'] = group

        students = list(users_collection.find(
            query,
            {'password': 0}
        ).sort('created_at', -1))
        students = [jsonify_user(s) for s in students]

        groups_summary = list(users_collection.aggregate([
            {'$match': {'rol': 'alumno', 'grupo': {'$exists': True, '$ne': ''}}},
            {'$group': {'_id': '$grupo', 'count': {'$sum': 1}}},
            {'$sort': {'_id': 1}}
        ]))

        groups = [item.get('_id') for item in groups_summary if item.get('_id')]
        groups_with_count = [
            {
                'name': item.get('_id'),
                'count': item.get('count', 0)
            }
            for item in groups_summary
            if item.get('_id')
        ]

        return jsonify({
            'success': True,
            'count': len(students),
            'groups': groups,
            'groups_summary': groups_with_count,
            'students': students
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/students/groups/<group_name>', methods=['PUT'])
@maestro_required
def rename_students_group(group_name):
    """Renombra un grupo para todos los alumnos del grupo"""
    try:
        data = request.get_json() or {}
        new_group = (data.get('new_group') or '').strip()
        old_group = (group_name or '').strip()

        if not old_group:
            return jsonify({'success': False, 'error': 'Grupo inválido'}), 400
        if not new_group:
            return jsonify({'success': False, 'error': 'El nuevo nombre del grupo es requerido'}), 400
        if old_group == new_group:
            return jsonify({'success': False, 'error': 'El nombre del grupo no cambió'}), 400

        result = users_collection.update_many(
            {'rol': 'alumno', 'grupo': old_group},
            {'$set': {'grupo': new_group}}
        )

        return jsonify({
            'success': True,
            'message': 'Grupo actualizado',
            'modified_count': result.modified_count
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/students/groups/<group_name>', methods=['DELETE'])
@maestro_required
def delete_students_group(group_name):
    """Elimina un grupo y borra todos los alumnos de ese grupo"""
    try:
        target_group = (group_name or '').strip()
        if not target_group:
            return jsonify({'success': False, 'error': 'Grupo inválido'}), 400

        result = users_collection.delete_many(
            {'rol': 'alumno', 'grupo': target_group},
        )

        return jsonify({
            'success': True,
            'message': 'Grupo eliminado',
            'deleted_count': result.deleted_count
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== RUTAS DE PREGUNTAS (CRUD) ==========
@app.route('/api/questions', methods=['GET'])
def get_all_questions():
    """Obtiene todas las preguntas (con filtro opcional por materia)"""
    try:
        subject = request.args.get('subject', None)
        query = {}
        if subject:
            query['subject'] = subject
            
        questions = list(questions_collection.find(query))
        questions = [jsonify_question(q) for q in questions]
        
        return jsonify({
            'success': True,
            'count': len(questions),
            'questions': questions
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/questions', methods=['POST'])
@maestro_required
def create_question():
    try:
        # Si viene como multipart/form-data
        data = request.form.to_dict()

        # Validación
        if not data.get('question'):
            return jsonify({
                'success': False,
                'error': 'La pregunta es requerida'
            }), 400

        # ---- Manejo de imagen ----
        image_file = request.files.get('image')
        image_filename = None

        if image_file and image_file.filename != '':
            if allowed_file(image_file.filename):
                filename = secure_filename(image_file.filename)
                # Agregar timestamp para evitar colisiones
                filename = f"{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}_{filename}"
                image_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                image_file.save(image_path)
                image_filename = filename
            else:
                return jsonify({
                    'success': False,
                    'error': 'Tipo de archivo no permitido. Use PNG, JPG, JPEG, GIF, BMP o SVG'
                }), 400

        # Parsear campos que vienen como string
        has_options = data.get('has_options', 'false').lower() == 'true'
        options = []
        try:
            if data.get('options'):
                import json
                options = json.loads(data.get('options'))
        except:
            options = []

        correct_option = int(data.get('correct_option', -1))
        subject_value = data.get('subject', 'Matemáticas')
        topic_value = data.get('topic', 'General')
        simulator_section = normalize_simulator_section(data.get('simulator_subject', ''))

        if subject_value == SIMULATOR_SUBJECT:
            if not topic_value or not str(topic_value).strip():
                return jsonify({
                    'success': False,
                    'error': 'El nombre del simulador es requerido'
                }), 400
            if not simulator_section:
                return jsonify({
                    'success': False,
                    'error': 'La materia interna del simulador es requerida'
                }), 400
            ensure_simulator(topic_value)

        # Crear documento de pregunta
        question_doc = {
            'subject': subject_value,
            'topic': topic_value,
            'simulator_subject': simulator_section if subject_value == SIMULATOR_SUBJECT else '',
            'question': data['question'],
            'has_options': has_options,
            'options': options,
            'correct_answer': data.get('correct_answer', ''),
            'correct_option': correct_option,
            'solution': data.get('solution', ''),
            'university': data.get('university', 'UNAM'),
            'image': image_filename,  # Guardar nombre del archivo
            'created_at': datetime.now(UTC),
            'times_shown': 0,
            'times_correct': 0
        }

        # Insertar en MongoDB
        result = questions_collection.insert_one(question_doc)

        # Devolver pregunta creada
        question_doc['_id'] = str(result.inserted_id)

        return jsonify({
            'success': True,
            'message': 'Pregunta creada exitosamente',
            'question': question_doc
        }), 201

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/pix2text', methods=['POST'])
@maestro_required
def pix2text_to_latex():
    try:
        image_file = request.files.get('image')
        if not image_file or image_file.filename == '':
            return jsonify({
                'success': False,
                'error': 'La imagen es requerida'
            }), 400

        if not allowed_file(image_file.filename):
            return jsonify({
                'success': False,
                'error': 'Tipo de archivo no permitido. Use PNG, JPG, JPEG, GIF, BMP o SVG'
            }), 400

        _, ext = os.path.splitext(secure_filename(image_file.filename))
        suffix = ext.lower() if ext else '.png'
        temp_path = None

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            image_file.save(tmp.name)
            temp_path = tmp.name

        try:
            p2t = get_pix2text()
            latex = normalize_pix2text_output(p2t.recognize_formula(temp_path))
        finally:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)

        if not latex or not str(latex).strip():
            return jsonify({
                'success': False,
                'error': 'No se detectó una fórmula válida en la imagen'
            }), 400

        return jsonify({
            'success': True,
            'latex': str(latex).strip()
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

    
@app.route('/api/bulk_questions', methods=['POST'])
@maestro_required
def bulk_questions():
    """Procesa carga masiva de preguntas desde texto"""
    try:
        data = request.get_json()
        texto = data.get('texto', '')
        
        # Obtener materia, tema y universidad del frontend
        subject = data.get('subject', 'Matemáticas')
        topic = data.get('topic', 'General')
        university = data.get('university', 'UNAM')
        simulator_section = normalize_simulator_section(data.get('simulator_subject', ''))
        
        if not texto:
            return jsonify({
                'success': False,
                'error': 'No se proporcionó texto para procesar'
            }), 400
        
        if not topic or topic.strip() == '':
            return jsonify({
                'success': False,
                'error': 'El tema es requerido'
            }), 400

        if subject == SIMULATOR_SUBJECT:
            ensure_simulator(topic)
            if not simulator_section:
                return jsonify({
                    'success': False,
                    'error': 'La materia interna del simulador es requerida'
                }), 400
        
        # Separar en bloques (cada pregunta separada por línea en blanco)
        texto_normalizado = texto.replace('\r\n', '\n').replace('\r', '\n')
        bloques = re.split(r'\n\s*\n+', texto_normalizado.strip())
        preguntas_insertadas = []
        
        for bloque in bloques:
            lineas = [l.strip() for l in bloque.split('\n') if l.strip()]
            
            # Necesitamos al menos 6 líneas: pregunta + 4 opciones + respuesta
            if len(lineas) < 6:
                continue
            
            # La primera línea es la pregunta
            pregunta = lineas[0]
            
            # Extraer opciones (A, B, C, D)
            opciones = []
            opcion_correcta = -1
            
            # Buscar opciones en cualquier orden
            for i, linea in enumerate(lineas[1:]):
                linea_lower = linea.lower()
                
                # Buscar patrón A) o A.
                if re.match(r'^a[\)\.]\s*', linea_lower):
                    opcion_texto = linea[2:].strip()
                    opciones.append(opcion_texto)
                elif re.match(r'^b[\)\.]\s*', linea_lower):
                    opcion_texto = linea[2:].strip()
                    opciones.append(opcion_texto)
                elif re.match(r'^c[\)\.]\s*', linea_lower):
                    opcion_texto = linea[2:].strip()
                    opciones.append(opcion_texto)
                elif re.match(r'^d[\)\.]\s*', linea_lower):
                    opcion_texto = linea[2:].strip()
                    opciones.append(opcion_texto)
            
            # Asegurar que tenemos exactamente 4 opciones
            if len(opciones) != 4:
                # Intentar otro formato: puede que las opciones estén en líneas separadas
                opciones = []
                for linea in lineas[1:5]:  # Las primeras 4 líneas después de la pregunta
                    if linea.strip():
                        opciones.append(linea.strip())
            
            # Si aún no tenemos 4 opciones, saltar esta pregunta
            if len(opciones) != 4:
                continue
            
            # Buscar respuesta correcta
            for linea in lineas:
                linea_lower = linea.lower()
                
                # Buscar "respuesta: A" o "correcta: B"
                if 'respuesta:' in linea_lower or 'correcta:' in linea_lower:
                    # Extraer la letra de la respuesta
                    match = re.search(r'[AaBbCcDd]', linea_lower.split(':')[-1])
                    if match:
                        letra = match.group().upper()
                        if letra == 'A':
                            opcion_correcta = 0
                        elif letra == 'B':
                            opcion_correcta = 1
                        elif letra == 'C':
                            opcion_correcta = 2
                        elif letra == 'D':
                            opcion_correcta = 3
                    break
            
            # Si no se encontró respuesta, usar la primera como default
            if opcion_correcta == -1:
                opcion_correcta = 0
            
            # Crear documento de pregunta con los valores del frontend
            pregunta_doc = {
                'subject': subject,
                'topic': topic,
                'simulator_subject': simulator_section if subject == SIMULATOR_SUBJECT else '',
                'question': pregunta,
                'has_options': True,
                'options': opciones,
                'correct_option': opcion_correcta,
                'correct_answer': f"{chr(65 + opcion_correcta)}. {opciones[opcion_correcta]}",
                'answer': opciones[opcion_correcta],
                'solution': '',
                'university': university,
                'created_at': datetime.now(UTC),
                'times_shown': 0,
                'times_correct': 0,
                'source': 'carga_masiva'
            }
            
            preguntas_insertadas.append(pregunta_doc)
        
        # Insertar todas las preguntas en batch
        if preguntas_insertadas:
            result = questions_collection.insert_many(preguntas_insertadas)
            
            return jsonify({
                'success': True,
                'message': f'Se insertaron {len(preguntas_insertadas)} preguntas',
                'inserted_count': len(preguntas_insertadas),
                'inserted_ids': [str(id) for id in result.inserted_ids],
                'subject': subject,
                'topic': topic,
                'university': university
            })
        else:
            return jsonify({
                'success': False,
                'error': 'No se pudieron procesar preguntas del texto proporcionado',
                'suggestions': [
                    'Formato sugerido:',
                    'Pregunta (primera línea)',
                    'A) Opción A',
                    'B) Opción B',
                    'C) Opción C',
                    'D) Opción D',
                    'Respuesta: A (última línea)',
                    '',
                    'Cada pregunta debe estar separada por una línea en blanco'
                ]
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Error procesando carga masiva: {str(e)}'
        }), 500

@app.route('/api/questions/<question_id>', methods=['PUT'])
@maestro_required
def update_question(question_id):
    """Actualiza una pregunta existente"""
    try:
        data = request.get_json()
        
        # Validación
        if not data.get('question'):
            return jsonify({
                'success': False,
                'error': 'La pregunta es requerida'
            }), 400
        
        # Crear documento de actualización
        update_doc = {
            'subject': data.get('subject', 'Matemáticas'),
            'topic': data.get('topic', 'General'),
            'question': data['question'],
            'has_options': data.get('has_options', False),
            'options': data.get('options', []),
            'correct_answer': data.get('correct_answer', ''),
            'correct_option': data.get('correct_option', -1),
            'solution': data.get('solution', ''),
            'university': data.get('university', 'UNAM'),
            'simulator_subject': normalize_simulator_section(data.get('simulator_subject', '')),
            'updated_at': datetime.now(UTC)
        }
        
        if update_doc['subject'] == SIMULATOR_SUBJECT:
            ensure_simulator(update_doc['topic'])
            if not update_doc['simulator_subject']:
                return jsonify({
                    'success': False,
                    'error': 'La materia interna del simulador es requerida'
                }), 400
        else:
            update_doc['simulator_subject'] = ''

        # Actualizar en MongoDB
        result = questions_collection.update_one(
            {'_id': ObjectId(question_id)},
            {'$set': update_doc}
        )
        
        if result.modified_count == 1:
            updated_question = questions_collection.find_one({'_id': ObjectId(question_id)})
            return jsonify({
                'success': True,
                'message': 'Pregunta actualizada exitosamente',
                'question': jsonify_question(updated_question)
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Pregunta no encontrada o sin cambios'
            }), 404
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/questions/<question_id>', methods=['DELETE'])
@maestro_required
def delete_question(question_id):
    """Elimina una pregunta"""
    try:
        result = questions_collection.delete_one({'_id': ObjectId(question_id)})
        
        if result.deleted_count == 1:
            return jsonify({
                'success': True,
                'message': 'Pregunta eliminada'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Pregunta no encontrada'
            }), 404
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== RUTAS DE CONSULTA ==========
@app.route('/api/questions/random', methods=['GET'])
def get_random_question():
    """Obtiene una pregunta aleatoria (con filtros opcionales)"""
    try:
        subject = request.args.get('subject', None)
        topic = request.args.get('topic', None)
        exclude_simulator = request.args.get('exclude_simulator', 'false').lower() in ['true', '1', 'yes']
        
        query = {}
        if subject and subject.lower() != 'todos':
            query['subject'] = subject
        elif exclude_simulator:
            query['subject'] = {'$ne': SIMULATOR_SUBJECT}
        if topic and topic.lower() != 'todos' and topic.lower() != 'all':
            query['topic'] = {'$regex': f'^{topic}$', '$options': 'i'}
        
        # Obtener preguntas que cumplen el filtro
        questions = list(questions_collection.find(query))
        
        if not questions:
            return jsonify({
                'success': False,
                'error': 'No hay preguntas disponibles'
            }), 404
        
        # Seleccionar aleatoriamente
        random_question = random.choice(questions)
        
        # Incrementar contador de veces mostrada
        questions_collection.update_one(
            {'_id': random_question['_id']},
            {'$inc': {'times_shown': 1}}
        )
        
        return jsonify({
            'success': True,
            'question': jsonify_question(random_question)
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/questions/<question_id>/answer', methods=['POST'])
def register_answer(question_id):
    """Registra una respuesta a una pregunta"""
    try:
        data = request.get_json()
        correct = data.get('correct', False)
        
        update_data = {'$inc': {'times_shown': 1}}
        if correct:
            update_data['$inc']['times_correct'] = 1
        
        questions_collection.update_one(
            {'_id': ObjectId(question_id)},
            update_data
        )
        
        return jsonify({
            'success': True,
            'message': 'Respuesta registrada'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/subjects', methods=['GET'])
def get_subjects():
    """Obtiene la lista de materias disponibles"""
    try:
        subjects = questions_collection.distinct('subject')
        return jsonify({
            'success': True,
            'subjects': subjects
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/subjects/<subject>/topics', methods=['GET'])
def get_topics_by_subject(subject):
    """Obtiene los temas de una materia específica"""
    try:
        topics = questions_collection.distinct('topic', {'subject': subject})
        return jsonify({
            'success': True,
            'subject': subject,
            'topics': topics
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/simulators', methods=['GET'])
def get_simulators():
    """Obtiene la lista de simuladores disponibles"""
    try:
        user_scores = {}
        if 'user_id' in session:
            user_scores_cursor = simulator_scores_collection.find(
                {'user_id': session['user_id']},
                {'simulator': 1, 'correct': 1, 'total': 1}
            )
            for doc in user_scores_cursor:
                user_scores[doc.get('simulator')] = {
                    'correct': doc.get('correct', 0),
                    'total': doc.get('total', 0)
                }

        topic_names = questions_collection.distinct('topic', {'subject': SIMULATOR_SUBJECT})
        topic_names = [s for s in topic_names if s and str(s).strip() != '']
        stored_names = simulators_collection.distinct('name')
        simulator_names = sorted(set(topic_names + stored_names))

        simulators = []
        now_utc = datetime.now(UTC)
        for name in simulator_names:
            simul = simulators_collection.find_one({'name': name})
            if not simul:
                ensure_simulator(name)
                simul = simulators_collection.find_one({'name': name})

            count = questions_collection.count_documents({
                'subject': SIMULATOR_SUBJECT,
                'topic': name
            })
            simulators.append({
                'name': name,
                'time_limit': simul.get('time_limit', DEFAULT_SIMULATOR_TIME) if simul else DEFAULT_SIMULATOR_TIME,
                'question_count': count,
                'last_score': user_scores.get(name),
                'enabled_from': datetime_to_iso_utc(simul.get('enabled_from')) if simul else None,
                'enabled_until': datetime_to_iso_utc(simul.get('enabled_until')) if simul else None,
                'force_enabled': parse_bool(simul.get('force_enabled'), False) if simul else False,
                'is_open': is_simulator_enabled(simul, now_utc)
            })
        return jsonify({
            'success': True,
            'simulators': simulators
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/simulators', methods=['POST'])
@maestro_required
def create_or_update_simulator():
    """Crea o actualiza un simulador"""
    try:
        data = request.get_json()
        name = (data.get('name') or '').strip()
        time_limit = data.get('time_limit', DEFAULT_SIMULATOR_TIME)
        enabled_from = parse_local_datetime_to_utc((data.get('enabled_from') or '').strip())
        enabled_until = parse_local_datetime_to_utc((data.get('enabled_until') or '').strip())
        existing_simulator = simulators_collection.find_one({'name': name})
        force_enabled = parse_bool(
            data.get('force_enabled'),
            parse_bool(existing_simulator.get('force_enabled'), False) if existing_simulator else False
        )

        if not name:
            return jsonify({'success': False, 'error': 'El nombre del simulador es requerido'}), 400
        if (data.get('enabled_from') and not enabled_from) or (data.get('enabled_until') and not enabled_until):
            return jsonify({'success': False, 'error': 'Formato de fecha/hora inválido'}), 400
        if enabled_from and enabled_until and enabled_from > enabled_until:
            return jsonify({'success': False, 'error': 'La fecha de inicio debe ser menor o igual a la de cierre'}), 400

        simulators_collection.update_one(
            {'name': name},
            {'$set': {
                'time_limit': int(time_limit),
                'enabled_from': enabled_from,
                'enabled_until': enabled_until,
                'force_enabled': force_enabled,
                'updated_at': datetime.now(UTC)
            },
             '$setOnInsert': {'created_at': datetime.now(UTC)}},
            upsert=True
        )

        return jsonify({'success': True, 'message': 'Simulador guardado'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/simulators/<simulator_name>', methods=['PUT'])
@maestro_required
def update_simulator(simulator_name):
    """Actualiza el tiempo o nombre de un simulador"""
    try:
        data = request.get_json()
        time_limit = data.get('time_limit', DEFAULT_SIMULATOR_TIME)
        new_name = (data.get('new_name') or '').strip()
        enabled_from = parse_local_datetime_to_utc((data.get('enabled_from') or '').strip())
        enabled_until = parse_local_datetime_to_utc((data.get('enabled_until') or '').strip())
        existing_simulator = simulators_collection.find_one({'name': simulator_name})
        force_enabled = parse_bool(
            data.get('force_enabled'),
            parse_bool(existing_simulator.get('force_enabled'), False) if existing_simulator else False
        )

        if (data.get('enabled_from') and not enabled_from) or (data.get('enabled_until') and not enabled_until):
            return jsonify({'success': False, 'error': 'Formato de fecha/hora inválido'}), 400
        if enabled_from and enabled_until and enabled_from > enabled_until:
            return jsonify({'success': False, 'error': 'La fecha de inicio debe ser menor o igual a la de cierre'}), 400

        if new_name and new_name != simulator_name:
            existing = simulators_collection.find_one({'name': new_name})
            if existing:
                return jsonify({'success': False, 'error': 'Ya existe un simulador con ese nombre'}), 400

            simulators_collection.update_one(
                {'name': simulator_name},
                {'$set': {
                    'name': new_name,
                    'time_limit': int(time_limit),
                    'enabled_from': enabled_from,
                    'enabled_until': enabled_until,
                    'force_enabled': force_enabled,
                    'updated_at': datetime.now(UTC)
                },
                 '$setOnInsert': {'created_at': datetime.now(UTC)}},
                upsert=True
            )

            # Actualizar preguntas asociadas
            questions_collection.update_many(
                {'subject': SIMULATOR_SUBJECT, 'topic': simulator_name},
                {'$set': {'topic': new_name}}
            )
            simulator_scores_collection.update_many(
                {'simulator': simulator_name},
                {'$set': {'simulator': new_name}}
            )
            simulator_attempts_collection.update_many(
                {'simulator': simulator_name},
                {'$set': {'simulator': new_name}}
            )

            return jsonify({'success': True, 'message': 'Simulador actualizado'})

        simulators_collection.update_one(
            {'name': simulator_name},
            {'$set': {
                'time_limit': int(time_limit),
                'enabled_from': enabled_from,
                'enabled_until': enabled_until,
                'force_enabled': force_enabled,
                'updated_at': datetime.now(UTC)
            },
             '$setOnInsert': {'created_at': datetime.now(UTC)}},
            upsert=True
        )

        return jsonify({'success': True, 'message': 'Simulador actualizado'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/simulators/<simulator_name>', methods=['DELETE'])
@maestro_required
def delete_simulator(simulator_name):
    """Elimina un simulador y sus preguntas"""
    try:
        simulators_collection.delete_one({'name': simulator_name})
        questions_collection.delete_many({'subject': SIMULATOR_SUBJECT, 'topic': simulator_name})
        simulator_scores_collection.delete_many({'simulator': simulator_name})
        simulator_attempts_collection.delete_many({'simulator': simulator_name})
        return jsonify({'success': True, 'message': 'Simulador eliminado'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/simulators/<simulator_name>/force-enable', methods=['POST'])
@maestro_required
def toggle_simulator_force_enable(simulator_name):
    """Activa o desactiva la habilitación forzada de un simulador"""
    try:
        data = request.get_json(silent=True) or {}
        force_enabled = parse_bool(data.get('force_enabled'), False)
        simulators_collection.update_one(
            {'name': simulator_name},
            {'$set': {
                'force_enabled': force_enabled,
                'updated_at': datetime.now(UTC)
            }},
            upsert=True
        )
        return jsonify({'success': True, 'force_enabled': force_enabled})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/simulators/<simulator_name>/score', methods=['POST'])
@login_required
def save_simulator_score(simulator_name):
    """Guarda el ultimo puntaje del usuario y su desglose por materia"""
    try:
        data = request.get_json() or {}
        correct = int(data.get('correct', 0))
        total = int(data.get('total', 0))
        section_stats = normalize_section_stats(data.get('section_stats'))

        if total < 0 or correct < 0 or correct > total:
            return jsonify({'success': False, 'error': 'Puntaje invalido'}), 400

        user_id = session.get('user_id')
        user_name = (session.get('nombre') or '').strip()
        user_group = ''
        if not user_name and user_id:
            try:
                user_doc = users_collection.find_one({'_id': ObjectId(user_id)})
                if user_doc:
                    nombre = (user_doc.get('nombre') or '').strip()
                    apellido = (user_doc.get('apellido') or '').strip()
                    user_name = f"{nombre} {apellido}".strip()
                    user_group = (user_doc.get('grupo') or '').strip()
            except Exception:
                user_name = ''
                user_group = ''
        elif user_id:
            try:
                user_doc = users_collection.find_one({'_id': ObjectId(user_id)}, {'grupo': 1})
                if user_doc:
                    user_group = (user_doc.get('grupo') or '').strip()
            except Exception:
                user_group = ''

        now_utc = datetime.now(UTC)
        simulator_scores_collection.update_one(
            {'user_id': user_id, 'simulator': simulator_name},
            {'$set': {
                'correct': correct,
                'total': total,
                'updated_at': now_utc
            }},
            upsert=True
        )

        # Guardar cada intento (historial persistente)
        simulator_attempts_collection.insert_one({
            'user_id': user_id,
            'student_name': user_name or 'Alumno',
            'student_group': user_group,
            'simulator': simulator_name,
            'correct': correct,
            'total': total,
            'section_stats': section_stats,
            'finished_at': now_utc,
            'created_at': now_utc
        })

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/simulators/<simulator_name>/results', methods=['GET'])
@login_required
def get_simulator_results(simulator_name):
    """Obtiene resultados agregados por alumno para un simulador"""
    try:
        current_user_id = str(session.get('user_id') or '')
        current_user_role = str(session.get('user_role') or '').strip().lower()
        attempts = list(simulator_attempts_collection.find({'simulator': simulator_name}))
        if not attempts:
            return jsonify({
                'success': True,
                'simulator': simulator_name,
                'sections': [],
                'results': []
            })

        # Tomar solo el primer intento por alumno para el ranking
        first_by_user = {}
        for attempt in attempts:
            user_key = str(attempt.get('user_id') or '')
            finished_at = attempt.get('finished_at') or datetime.min.replace(tzinfo=UTC)
            if finished_at.tzinfo is None:
                finished_at = finished_at.replace(tzinfo=UTC)
            if user_key not in first_by_user:
                first_by_user[user_key] = attempt
                first_by_user[user_key]['finished_at'] = finished_at
                continue
            prev_finished = first_by_user[user_key].get('finished_at') or datetime.min.replace(tzinfo=UTC)
            if prev_finished.tzinfo is None:
                prev_finished = prev_finished.replace(tzinfo=UTC)
            if finished_at < prev_finished:
                first_by_user[user_key] = attempt
                first_by_user[user_key]['finished_at'] = finished_at

        first_attempts = list(first_by_user.values())

        # Los alumnos pueden ver el ranking completo solo si ya realizaron ese simulador.
        if current_user_role != 'maestro':
            has_attempt = any(
                str(attempt.get('user_id') or '') == current_user_id
                for attempt in first_attempts
            )
            if not has_attempt:
                return jsonify({
                    'success': False,
                    'error': 'Aún no has realizado este simulador'
                }), 403
        all_sections = set()
        for attempt in first_attempts:
            section_stats = normalize_section_stats(attempt.get('section_stats'))
            attempt['section_stats'] = section_stats
            all_sections.update(section_stats.keys())

        order_map = {name: idx for idx, name in enumerate(SIMULATOR_SECTION_ORDER)}
        sections = sorted(all_sections, key=lambda s: (order_map.get(s, len(SIMULATOR_SECTION_ORDER)), s.lower()))
        first_attempts.sort(key=lambda a: (-(int(a.get('correct', 0) or 0)), -(int(a.get('total', 0) or 0)), a.get('finished_at') or datetime.max.replace(tzinfo=UTC)))

        rows = []
        for idx, attempt in enumerate(first_attempts, start=1):
            section_scores = {}
            for section in sections:
                stats = attempt['section_stats'].get(section, {'correct': 0, 'total': 0})
                section_scores[section] = {
                    'correct': int(stats.get('correct', 0) or 0),
                    'total': int(stats.get('total', 0) or 0)
                }
            rows.append({
                'position': idx,
                'student_name': attempt.get('student_name') or 'Alumno',
                'student_group': attempt.get('student_group') or (
                    (users_collection.find_one({'_id': ObjectId(attempt.get('user_id'))}, {'grupo': 1}) or {}).get('grupo', '')
                    if attempt.get('user_id') and ObjectId.is_valid(str(attempt.get('user_id'))) else ''
                ),
                'correct': int(attempt.get('correct', 0) or 0),
                'total': int(attempt.get('total', 0) or 0),
                'finished_at': datetime_to_iso_utc(attempt.get('finished_at')) if attempt.get('finished_at') else None,
                'section_scores': section_scores
            })

        return jsonify({
            'success': True,
            'simulator': simulator_name,
            'sections': sections,
            'results': rows
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/simulators/<simulator_name>/attendance', methods=['GET'])
@maestro_required
def get_simulator_attendance(simulator_name):
    """Obtiene lista de alumnos y estado de aplicacion para un simulador"""
    try:
        group = (request.args.get('group') or '').strip()
        students_query = {'rol': 'alumno'}
        if group and group != 'todos':
            students_query['grupo'] = group

        students = list(users_collection.find(
            students_query,
            {'nombre': 1, 'apellido': 1, 'email': 1, 'grupo': 1}
        ))

        attempts = list(simulator_attempts_collection.find(
            {'simulator': simulator_name},
            {'user_id': 1, 'finished_at': 1, 'correct': 1, 'total': 1}
        ))
        attempts_by_user = {}
        for attempt in attempts:
            uid = str(attempt.get('user_id') or '')
            if not uid:
                continue
            finished_at = attempt.get('finished_at') or datetime.min.replace(tzinfo=UTC)
            if finished_at.tzinfo is None:
                finished_at = finished_at.replace(tzinfo=UTC)
            prev = attempts_by_user.get(uid)
            if not prev or finished_at < prev.get('finished_at', datetime.max.replace(tzinfo=UTC)):
                attempts_by_user[uid] = {
                    'finished_at': finished_at,
                    'correct': int(attempt.get('correct', 0) or 0),
                    'total': int(attempt.get('total', 0) or 0)
                }

        rows = []
        completed = 0
        for student in students:
            sid = str(student.get('_id'))
            attempt = attempts_by_user.get(sid)
            status = 'Completado' if attempt else 'Pendiente'
            if attempt:
                completed += 1

            full_name = f"{(student.get('nombre') or '').strip()} {(student.get('apellido') or '').strip()}".strip()
            rows.append({
                'student_id': sid,
                'name': full_name or 'Alumno',
                'email': student.get('email') or '',
                'group': (student.get('grupo') or '').strip(),
                'status': status,
                'score': f"{attempt.get('correct', 0)}/{attempt.get('total', 0)}" if attempt else '-',
                'finished_at': datetime_to_iso_utc(attempt.get('finished_at')) if attempt else None
            })

        rows.sort(key=lambda item: (
            item.get('group') or 'ZZZ',
            item.get('name', '').lower()
        ))

        groups_summary = list(users_collection.aggregate([
            {'$match': {'rol': 'alumno', 'grupo': {'$exists': True, '$ne': ''}}},
            {'$group': {'_id': '$grupo', 'count': {'$sum': 1}}},
            {'$sort': {'_id': 1}}
        ]))

        return jsonify({
            'success': True,
            'simulator': simulator_name,
            'group': group or 'todos',
            'total_students': len(students),
            'completed_students': completed,
            'pending_students': max(0, len(students) - completed),
            'rows': rows,
            'groups': [
                {'name': item.get('_id'), 'count': int(item.get('count', 0))}
                for item in groups_summary if item.get('_id')
            ]
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/simulators/<simulator_name>/questions', methods=['GET'])
def get_simulator_questions(simulator_name):
    """Obtiene las preguntas de un simulador en orden fijo"""
    try:
        simul = simulators_collection.find_one({'name': simulator_name})
        now_utc = datetime.now(UTC)
        if simul and not is_simulator_enabled(simul, now_utc):
            start = simul.get('enabled_from')
            end = simul.get('enabled_until')
            if start and start.tzinfo is None:
                start = start.replace(tzinfo=UTC)
            if end and end.tzinfo is None:
                end = end.replace(tzinfo=UTC)

            if start and now_utc < start:
                return jsonify({
                    'success': False,
                    'error': f'Este simulador estará disponible desde {datetime_to_iso_utc(start)}'
                }), 403
            if end and now_utc > end:
                return jsonify({
                    'success': False,
                    'error': f'Este simulador cerró en {datetime_to_iso_utc(end)}'
                }), 403

        query = {
            'subject': SIMULATOR_SUBJECT,
            'topic': {'$regex': f'^{re.escape(simulator_name)}$', '$options': 'i'}
        }
        questions = list(questions_collection.find(query))
        for question in questions:
            question['simulator_subject'] = normalize_simulator_section(question.get('simulator_subject', ''))
        questions.sort(key=simulator_section_sort_key)
        questions = [jsonify_question(q) for q in questions]
        
        return jsonify({
            'success': True,
            'count': len(questions),
            'simulator': simulator_name,
            'time_limit': simul.get('time_limit', DEFAULT_SIMULATOR_TIME) if simul else DEFAULT_SIMULATOR_TIME,
            'enabled_from': datetime_to_iso_utc(simul.get('enabled_from')) if simul else None,
            'enabled_until': datetime_to_iso_utc(simul.get('enabled_until')) if simul else None,
            'force_enabled': parse_bool(simul.get('force_enabled'), False) if simul else False,
            'questions': questions
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Obtiene estadísticas del sistema"""
    try:
        total = questions_collection.count_documents({})
        
        # Estadísticas por materia
        pipeline_subjects = [
            {'$group': {'_id': '$subject', 'count': {'$sum': 1}}},
            {'$sort': {'count': -1}}
        ]
        subjects_stats = list(questions_collection.aggregate(pipeline_subjects))
        
        # Estadísticas por universidad
        pipeline_universities = [
            {'$group': {'_id': '$university', 'count': {'$sum': 1}}},
            {'$sort': {'count': -1}}
        ]
        universities_stats = list(questions_collection.aggregate(pipeline_universities))
        
        # Top temas
        pipeline_topics = [
            {'$group': {'_id': '$topic', 'count': {'$sum': 1}}},
            {'$sort': {'count': -1}},
            {'$limit': 5}
        ]
        top_topics = list(questions_collection.aggregate(pipeline_topics))
        
        # Total de veces mostradas
        pipeline_shown = [
            {'$group': {'_id': None, 'total': {'$sum': '$times_shown'}}}
        ]
        total_shown = list(questions_collection.aggregate(pipeline_shown))
        
        return jsonify({
            'success': True,
            'stats': {
                'total_questions': total,
                'subjects': subjects_stats,
                'universities': universities_stats,
                'top_topics': top_topics,
                'total_shown': total_shown[0]['total'] if total_shown else 0
            }
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== RUTAS DE LA API ==========
@app.route('/api')
def api_info():
    """Información de la API"""
    return jsonify({
        'message': 'API de Estudio Matemático',
        'database': db.name,
        'collection': questions_collection.name,
        'endpoints': {
            'GET /api/questions': 'Obtener todas las preguntas',
            'POST /api/questions': 'Crear nueva pregunta',
            'GET /api/questions/random': 'Obtener pregunta aleatoria',
            'PUT /api/questions/<id>': 'Actualizar pregunta',
            'DELETE /api/questions/<id>': 'Eliminar pregunta',
            'POST /api/questions/<id>/answer': 'Registrar respuesta',
            'GET /api/stats': 'Estadísticas',
            'GET /api/subjects': 'Obtener materias disponibles',
            'GET /api/subjects/<subject>/topics': 'Obtener temas por materia',
            'GET /api/students': 'Obtener alumnos (solo maestro)',
            'PUT /api/students/groups/<name>': 'Renombrar grupo de alumnos',
            'DELETE /api/students/groups/<name>': 'Eliminar grupo de alumnos',
            'GET /api/simulators': 'Obtener simuladores disponibles',
            'GET /api/simulators/<name>/questions': 'Obtener preguntas de un simulador',
            'POST /api/simulators': 'Crear/actualizar simulador',
            'PUT /api/simulators/<name>': 'Actualizar simulador',
            'DELETE /api/simulators/<name>': 'Eliminar simulador',
            'POST /api/simulators/<name>/force-enable': 'Habilitar/deshabilitar simulador fuera de horario',
            'POST /api/simulators/<name>/score': 'Guardar puntaje del usuario en simulador',
            'GET /api/simulators/<name>/results': 'Obtener ranking y resultados por simulador',
            'GET /api/simulators/<name>/attendance': 'Obtener control de aplicacion por alumno',
            'POST /api/register': 'Registrar alumno (solo maestro)',
            'POST /api/login': 'Iniciar sesión',
            'POST /api/logout': 'Cerrar sesión',
            'GET /api/current-user': 'Obtener usuario actual'
        }
    })

# ========== RUTAS DE PÁGINAS WEB ==========
@app.route('/login')
def login_page():
    """Página de login"""
    return render_template('login.html')

@app.route('/')
def index():
    """Página principal (redirige según autenticación)"""
    if 'user_id' not in session:
        return redirect('/login')
    
    # Si es maestro, redirigir al panel de maestro
    if session.get('user_role') == 'maestro':
        return render_template('maestro.html')
    
    # Si es alumno, redirigir al index normal
    return render_template('index.html')

@app.route('/static/<path:path>')
def serve_static(path):
    """Sirve archivos estáticos"""
    return send_from_directory('static', path)

# ========== FUNCIONES DE INICIALIZACIÓN ==========


def create_default_users():
    """Crea usuarios por defecto si no existen"""
    # Verificar si ya existe el usuario maestro
    maestro = users_collection.find_one({'email': 'maestro@multi.com'})
    if not maestro:
        users_collection.insert_one({
            'nombre': 'Maestro',
            'apellido': 'Principal',
            'email': 'maestro@multi.com',
            'password': hash_password('maestro123'),
            'rol': 'maestro',
            'created_at': datetime.now(UTC)
        })
        print("✅ Usuario maestro creado: maestro@multi.com / maestro123")
    
    # Verificar si ya existe el usuario alumno
    alumno = users_collection.find_one({'email': 'alumno@multi.com'})
    if not alumno:
        users_collection.insert_one({
            'nombre': 'Alumno',
            'apellido': 'Prueba',
            'email': 'alumno@multi.com',
            'password': hash_password('alumno123'),
            'rol': 'alumno',
            'created_at': datetime.now(UTC)
        })
        print("✅ Usuario alumno creado: alumno@multi.com / alumno123")

def print_startup_info():
    """Muestra información al iniciar la aplicación"""
    print("\n" + "="*50)
    print("🚀 API de Estudio con Autenticación")
    print("="*50)
    print(f"📦 Base de datos: {db.name}")
    print(f"👥 Colección de usuarios: {users_collection.name}")
    print(f"📚 Colección de preguntas: {questions_collection.name}")
    
    # Mostrar materias disponibles
    subjects = questions_collection.distinct('subject')
    print(f"📝 Materias disponibles: {', '.join(subjects) if subjects else 'Ninguna'}")
    
    # Mostrar cuentas de prueba
    print("\n🔐 Cuentas de prueba:")
    print("   👨‍🏫 Maestro: maestro@multi.com / maestro123")
    print("   👨‍🎓 Alumno: alumno@multi.com / alumno123")
    
    print("\n🌐 Frontend: http://localhost:5000/")
    print("🔌 API: http://localhost:5000/api")
    print("="*50 + "\n")

# ========== INICIO DE LA APLICACIÓN ==========
if __name__ == '__main__':
    # Crear usuarios por defecto
    create_default_users()
    
    # Mostrar información de inicio
    print_startup_info()
    
    # Iniciar servidor
    app.run(debug=True, host='0.0.0.0', port=5000)






