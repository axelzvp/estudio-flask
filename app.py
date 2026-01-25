from functools import wraps
from flask import Flask, redirect, request, jsonify, send_from_directory, render_template, session
from flask_cors import CORS
from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime
import random
import hashlib
import os
from dotenv import load_dotenv

load_dotenv()
MONGO_URI = os.environ.get("MONGO_URI")

# ========== CONFIGURACIÓN DE LA APLICACIÓN ==========
app = Flask(__name__)
CORS(app)
app.config['SECRET_KEY'] = os.getenv("SECRET_KEY")

# ========== CONEXIÓN A MONGODB ==========
client = MongoClient(MONGO_URI)
db = client['preguntas']
questions_collection = db['matematicas']
users_collection = db['usuarios']

# ========== FUNCIONES HELPER ==========
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
    """Crea una nueva pregunta"""
    try:
        data = request.get_json()
        
        # Validación
        if not data.get('question'):
            return jsonify({
                'success': False,
                'error': 'La pregunta es requerida'
            }), 400
        
        # Crear documento de pregunta
        question_doc = {
            'subject': data.get('subject', 'Matemáticas'),
            'topic': data.get('topic', 'General'),
            'question': data['question'],
            'has_options': data.get('has_options', False),
            'options': data.get('options', []),
            'correct_answer': data.get('correct_answer', ''),
            'correct_option': data.get('correct_option', -1),
            'solution': data.get('solution', ''),
            'university': data.get('university', 'UNAM'),
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
        
        query = {}
        if subject and subject.lower() != 'todos':
            query['subject'] = subject
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