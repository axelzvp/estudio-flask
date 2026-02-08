from functools import wraps
import re
from flask import Flask, redirect, request, jsonify, send_from_directory, render_template, session
from flask_cors import CORS
from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime
from werkzeug.utils import secure_filename
import random
import hashlib
import os
from dotenv import load_dotenv

load_dotenv()
MONGO_URI = os.environ.get("MONGO_URI")
SIMULATOR_SUBJECT = "Simulador"
DEFAULT_SIMULATOR_TIME = 30

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
    return question

def ensure_simulator(name):
    if not name or not str(name).strip():
        return
    simul = simulators_collection.find_one({'name': name})
    if not simul:
        simulators_collection.insert_one({
            'name': name,
            'time_limit': DEFAULT_SIMULATOR_TIME,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        })

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
def register_user():
    """Registra un nuevo usuario"""
    try:
        data = request.get_json()
        
        # Validar campos requeridos
        required_fields = ['nombre', 'apellido', 'email', 'password', 'rol']
        for field in required_fields:
            if not data.get(field):
                return jsonify({
                    'success': False,
                    'error': f'El campo {field} es requerido'
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
            'rol': data['rol'],
            'created_at': datetime.utcnow()
        }
        
        if question_doc['subject'] == SIMULATOR_SUBJECT:
            ensure_simulator(question_doc['topic'])

        # Insertar en MongoDB
        result = users_collection.insert_one(user_doc)
        
        # Crear sesión
        session['user_id'] = str(result.inserted_id)
        session['user_email'] = data['email']
        session['user_role'] = data['rol']
        session['user_name'] = f"{data['nombre']} {data['apellido']}"
        
        return jsonify({
            'success': True,
            'message': 'Usuario registrado exitosamente',
            'user': {
                '_id': str(result.inserted_id),
                'nombre': data['nombre'],
                'apellido': data['apellido'],
                'email': data['email'],
                'rol': data['rol']
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
                filename = f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{filename}"
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

        # Crear documento de pregunta
        question_doc = {
            'subject': data.get('subject', 'Matemáticas'),
            'topic': data.get('topic', 'General'),
            'question': data['question'],
            'has_options': has_options,
            'options': options,
            'correct_answer': data.get('correct_answer', ''),
            'correct_option': correct_option,
            'solution': data.get('solution', ''),
            'university': data.get('university', 'UNAM'),
            'image': image_filename,  # Guardar nombre del archivo
            'created_at': datetime.utcnow(),
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
                'question': pregunta,
                'has_options': True,
                'options': opciones,
                'correct_option': opcion_correcta,
                'correct_answer': f"{chr(65 + opcion_correcta)}. {opciones[opcion_correcta]}",
                'answer': opciones[opcion_correcta],
                'solution': '',
                'university': university,
                'created_at': datetime.utcnow(),
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
            'updated_at': datetime.utcnow()
        }
        
        if update_doc['subject'] == SIMULATOR_SUBJECT:
            ensure_simulator(update_doc['topic'])

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
        topic_names = questions_collection.distinct('topic', {'subject': SIMULATOR_SUBJECT})
        topic_names = [s for s in topic_names if s and str(s).strip() != '']
        stored_names = simulators_collection.distinct('name')
        simulator_names = sorted(set(topic_names + stored_names))

        simulators = []
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
                'question_count': count
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

        if not name:
            return jsonify({'success': False, 'error': 'El nombre del simulador es requerido'}), 400

        simulators_collection.update_one(
            {'name': name},
            {'$set': {'time_limit': int(time_limit), 'updated_at': datetime.utcnow()},
             '$setOnInsert': {'created_at': datetime.utcnow()}},
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

        if new_name and new_name != simulator_name:
            existing = simulators_collection.find_one({'name': new_name})
            if existing:
                return jsonify({'success': False, 'error': 'Ya existe un simulador con ese nombre'}), 400

            simulators_collection.update_one(
                {'name': simulator_name},
                {'$set': {'name': new_name, 'time_limit': int(time_limit), 'updated_at': datetime.utcnow()},
                 '$setOnInsert': {'created_at': datetime.utcnow()}},
                upsert=True
            )

            # Actualizar preguntas asociadas
            questions_collection.update_many(
                {'subject': SIMULATOR_SUBJECT, 'topic': simulator_name},
                {'$set': {'topic': new_name}}
            )

            return jsonify({'success': True, 'message': 'Simulador actualizado'})

        simulators_collection.update_one(
            {'name': simulator_name},
            {'$set': {'time_limit': int(time_limit), 'updated_at': datetime.utcnow()},
             '$setOnInsert': {'created_at': datetime.utcnow()}},
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
        return jsonify({'success': True, 'message': 'Simulador eliminado'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/simulators/<simulator_name>/questions', methods=['GET'])
def get_simulator_questions(simulator_name):
    """Obtiene las preguntas de un simulador en orden fijo"""
    try:
        simul = simulators_collection.find_one({'name': simulator_name})
        query = {
            'subject': SIMULATOR_SUBJECT,
            'topic': {'$regex': f'^{re.escape(simulator_name)}$', '$options': 'i'}
        }
        questions = list(questions_collection.find(query).sort('created_at', 1))
        questions = [jsonify_question(q) for q in questions]
        
        return jsonify({
            'success': True,
            'count': len(questions),
            'simulator': simulator_name,
            'time_limit': simul.get('time_limit', DEFAULT_SIMULATOR_TIME) if simul else DEFAULT_SIMULATOR_TIME,
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
            'GET /api/simulators': 'Obtener simuladores disponibles',
            'GET /api/simulators/<name>/questions': 'Obtener preguntas de un simulador',
            'POST /api/simulators': 'Crear/actualizar simulador',
            'PUT /api/simulators/<name>': 'Actualizar simulador',
            'DELETE /api/simulators/<name>': 'Eliminar simulador',
            'POST /api/register': 'Registrar usuario',
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
            'created_at': datetime.utcnow()
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
            'created_at': datetime.utcnow()
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
