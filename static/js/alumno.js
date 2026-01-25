// alumno.js - Solo para vista de alumno
const API_URL = '/api';
let currentQuestion = null;
let allQuestions = [];
let allSubjects = [];
let selectedSubject = 'todos';
let selectedTopic = 'todos';

// Inicializar cuando se carga la página
document.addEventListener('DOMContentLoaded', function() {
    initAlumnoApp();
});

function initAlumnoApp() {
    // Configurar eventos
    setupEventListeners();
    
    // Cargar datos iniciales
    loadAlumnoData();
    
    // Verificar autenticación
    checkAuth();
}

function setupEventListeners() {
    // Botón para obtener pregunta
    const getQuestionBtn = document.getElementById('getQuestionBtn');
    if (getQuestionBtn) {
        getQuestionBtn.addEventListener('click', getRandomQuestionAlumno);
    }
    
    // Botón de ayuda
    const helpBtn = document.getElementById('showHelpBtn');
    if (helpBtn) {
        helpBtn.addEventListener('click', function() {
            showNotification('Selecciona una materia y un tema, luego haz clic en "Obtener Pregunta"', 'info');
        });
    }
    
    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
}

async function checkAuth() {
    try {
        const response = await fetch(`${API_URL}/current-user`);
        const data = await response.json();
        
        if (!data.success) {
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('Error verificando autenticación:', error);
        window.location.href = '/login';
    }
}

async function loadAlumnoData() {
    try {
        // Cargar materias
        const subjectsResponse = await fetch(`${API_URL}/subjects`);
        const subjectsData = await subjectsResponse.json();
        
        if (subjectsData.success) {
            allSubjects = subjectsData.subjects;
            loadStudySubjectsAlumno();
        }
        
        // Cargar preguntas
        const questionsResponse = await fetch(`${API_URL}/questions`);
        const questionsData = await questionsResponse.json();
        
        if (questionsData.success) {
            allQuestions = questionsData.questions;
            updateSidebarStatsAlumno();
        }
        
    } catch (error) {
        console.error('Error cargando datos:', error);
        showNotification('Error al cargar los datos', 'error');
    }
}

function loadStudySubjectsAlumno() {
    const container = document.getElementById('subjectButtons');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Agregar "Todas las materias"
    const allBtn = document.createElement('button');
    allBtn.className = selectedSubject === 'todos' ? 'subject-btn active' : 'subject-btn';
    allBtn.innerHTML = `
        <i class="fas fa-layer-group"></i>
        <span>Todas las materias</span>
    `;
    allBtn.addEventListener('click', () => {
        selectSubjectAlumno('todos');
    });
    container.appendChild(allBtn);
    
    // Agregar cada materia
    allSubjects.forEach(subject => {
        const count = allQuestions.filter(q => q.subject === subject).length;
        if (count === 0) return;
        
        const btn = document.createElement('button');
        btn.className = selectedSubject === subject ? 'subject-btn active' : 'subject-btn';
        btn.innerHTML = `
            <i class="fas fa-book"></i>
            <span>${subject}</span>
            <span class="count">${count}</span>
        `;
        btn.addEventListener('click', () => {
            selectSubjectAlumno(subject);
        });
        container.appendChild(btn);
    });
}

function selectSubjectAlumno(subject) {
    selectedSubject = subject;
    
    // Actualizar UI
    document.querySelectorAll('.subject-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Activar botón seleccionado
    const activeBtn = Array.from(document.querySelectorAll('.subject-btn'))
        .find(btn => {
            const span = btn.querySelector('span:not(.count)');
            return span ? span.textContent === subject || 
                         (subject === 'todos' && span.textContent === 'Todas las materias') : false;
        });
    
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    // Mostrar/ocultar selector de temas
    const topicSelector = document.getElementById('topicSelectorContainer');
    if (subject !== 'todos') {
        loadStudyTopicsAlumno(subject);
        topicSelector.style.display = 'block';
        document.getElementById('currentSubjectName').textContent = subject;
    } else {
        topicSelector.style.display = 'none';
        selectedTopic = 'todos';
    }
}

async function loadStudyTopicsAlumno(subject) {
    const container = document.getElementById('studyTopicButtons');
    if (!container) return;
    
    try {
        const response = await fetch(`${API_URL}/subjects/${encodeURIComponent(subject)}/topics`);
        const data = await response.json();
        
        container.innerHTML = '';
        
        if (data.success && data.topics.length > 0) {
            // Agregar "Todos los temas"
            const allBtn = document.createElement('div');
            allBtn.className = selectedTopic === 'todos' ? 'topic-btn-with-action all-topics active' : 'topic-btn-with-action all-topics';
            allBtn.innerHTML = `
                <div class="topic-btn-content">
                    <i class="fas fa-layer-group"></i> Todos los temas
                </div>
            `;
            allBtn.addEventListener('click', () => {
                selectTopicAlumno('todos');
            });
            container.appendChild(allBtn);
            
            // Agregar cada tema
            data.topics.forEach(topic => {
                const btn = document.createElement('div');
                btn.className = selectedTopic === topic ? 'topic-btn-with-action active' : 'topic-btn-with-action';
                btn.innerHTML = `
                    <div class="topic-btn-content">
                        <i class="fas fa-folder"></i> ${topic}
                    </div>
                `;
                btn.addEventListener('click', () => {
                    selectTopicAlumno(topic);
                });
                container.appendChild(btn);
            });
        }
    } catch (error) {
        console.error('Error cargando temas:', error);
        container.innerHTML = '<p style="color: var(--text-muted);">Error cargando temas</p>';
    }
}

function selectTopicAlumno(topic) {
    selectedTopic = topic;
    
    document.querySelectorAll('.topic-btn-with-action').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeBtn = Array.from(document.querySelectorAll('.topic-btn-with-action'))
        .find(btn => {
            const content = btn.querySelector('.topic-btn-content');
            return content ? content.textContent.includes(topic) || 
                           (topic === 'todos' && content.textContent.includes('Todos los temas')) : false;
        });
    
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
}

async function getRandomQuestionAlumno() {
    if (!selectedSubject) {
        showNotification('Por favor, selecciona una materia primero', 'warning');
        return;
    }
    
    let url = `${API_URL}/questions/random`;
    const params = [];
    
    if (selectedSubject !== 'todos') {
        params.push(`subject=${encodeURIComponent(selectedSubject)}`);
    }
    
    if (selectedTopic !== 'todos') {
        params.push(`topic=${encodeURIComponent(selectedTopic)}`);
    }
    
    if (params.length > 0) {
        url += '?' + params.join('&');
    }
    
    const getBtn = document.getElementById('getQuestionBtn');
    const originalText = getBtn.innerHTML;
    getBtn.innerHTML = '<i class="fas fa-spinner loading"></i> Buscando...';
    getBtn.disabled = true;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
            currentQuestion = data.question;
            displayQuestionAlumno(currentQuestion);
            showNotification('✅ Pregunta cargada', 'success');
        } else {
            showNotification('No hay preguntas con estos filtros', 'warning');
            document.getElementById('questionCard').style.display = 'none';
            document.getElementById('noQuestionsMessage').style.display = 'block';
        }
    } catch (error) {
        console.error('Error obteniendo pregunta:', error);
        showNotification('Error de conexión', 'error');
    } finally {
        getBtn.innerHTML = originalText;
        getBtn.disabled = false;
    }
}

function displayQuestionAlumno(question) {
    const questionCard = document.getElementById('questionCard');
    const questionBadges = document.getElementById('questionBadges');
    const questionText = document.getElementById('questionText');
    const optionsContainer = document.getElementById('optionsContainer');
    const answerSection = document.getElementById('answerSection');
    const answerText = document.getElementById('answerText');
    const solutionText = document.getElementById('solutionContent');
    const noQuestionsMessage = document.getElementById('noQuestionsMessage');
    
    // Mostrar tarjeta
    questionCard.style.display = 'block';
    noQuestionsMessage.style.display = 'none';
    answerSection.classList.remove('show');
    
    // Actualizar badges
    questionBadges.innerHTML = `
        <span class="badge badge-subject">${question.subject}</span>
        <span class="badge badge-topic">${question.topic}</span>
        ${question.university ? `<span class="badge badge-university">${question.university}</span>` : ''}
    `;
    
    // Actualizar texto de la pregunta
    questionText.innerHTML = question.question;
    
    // Mostrar opciones si es pregunta de opción múltiple
    if (question.has_options && question.options && question.options.length > 0) {
        optionsContainer.style.display = 'grid';
        optionsContainer.innerHTML = '';
        
        question.options.forEach((option, index) => {
            const letter = String.fromCharCode(65 + index);
            const optionDiv = document.createElement('div');
            optionDiv.className = 'exam-option';
            optionDiv.innerHTML = `
                <div class="option-letter">${letter}</div>
                <div class="option-content">${option}</div>
            `;
            optionDiv.addEventListener('click', () => checkAnswerAlumno(index, question));
            optionsContainer.appendChild(optionDiv);
        });
    } else {
        optionsContainer.style.display = 'none';
        // Para preguntas abiertas, mostrar respuesta automáticamente
        showAnswerAlumno(question);
    }
    
    // Renderizar MathJax
    if (window.MathJax) {
        MathJax.typesetPromise()
            .catch(err => console.log('MathJax error:', err));
    }
}

function checkAnswerAlumno(selectedIndex, question) {
    if (!question.has_options) return;
    
    const optionsContainer = document.getElementById('optionsContainer');
    const optionDivs = optionsContainer.querySelectorAll('.exam-option');
    const isCorrect = selectedIndex === question.correct_option;
    
    // Deshabilitar todas las opciones
    optionDivs.forEach(div => {
        div.style.cursor = 'not-allowed';
        div.onclick = null;
    });
    
    // Marcar opción seleccionada
    const selectedDiv = optionDivs[selectedIndex];
    if (selectedDiv) {
        selectedDiv.classList.add(isCorrect ? 'correct' : 'incorrect');
    }
    
    // Marcar opción correcta (si el usuario se equivocó)
    if (!isCorrect && question.correct_option >= 0) {
        const correctDiv = optionDivs[question.correct_option];
        if (correctDiv) {
            correctDiv.classList.add('correct');
        }
    }
    
    // Mostrar notificación
    showNotification(
        isCorrect ? '✅ ¡Respuesta correcta!' : '❌ Respuesta incorrecta',
        isCorrect ? 'success' : 'error'
    );
    
    // Mostrar solución si existe
    showAnswerAlumno(question);
}

function showAnswerAlumno(question) {
    const answerSection = document.getElementById('answerSection');
    const answerText = document.getElementById('answerText');
    const solutionBox = document.getElementById('solutionText');
    const solutionContent = document.getElementById('solutionContent');
    
    // Mostrar respuesta
    if (question.has_options && question.correct_option >= 0) {
        const letter = String.fromCharCode(65 + question.correct_option);
        const correctOption = question.options ? question.options[question.correct_option] : '';
        answerText.innerHTML = `<p><strong>Respuesta correcta:</strong> ${letter}. ${correctOption}</p>`;
    } else {
        answerText.innerHTML = `<p><strong>Respuesta:</strong> ${question.answer || question.correct_answer || ''}</p>`;
    }
    
    // Mostrar solución si existe
    if (question.solution && question.solution.trim() !== '') {
        solutionContent.innerHTML = question.solution;
        solutionBox.style.display = 'block';
    } else {
        solutionBox.style.display = 'none';
    }
    
    // Mostrar sección de respuesta
    answerSection.classList.add('show');
    
    // Renderizar MathJax
    if (window.MathJax) {
        MathJax.typesetPromise()
            .catch(err => console.log('MathJax error:', err));
    }
}

function updateSidebarStatsAlumno() {
    const total = allQuestions.length;
    const subjects = allSubjects.length;
    const shown = allQuestions.reduce((sum, q) => sum + (q.times_shown || 0), 0);
    
    document.getElementById('sidebarTotal').textContent = total;
    document.getElementById('sidebarSubjects').textContent = subjects;
    document.getElementById('sidebarShown').textContent = shown;
}

function showNotification(message, type = 'success') {
    // Crear notificación si no existe
    let notification = document.getElementById('notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        notification.className = `notification ${type}`;
        document.body.appendChild(notification);
    }
    
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 4000);
}

async function logout() {
    try {
        const response = await fetch(`${API_URL}/logout`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Hacer funciones disponibles globalmente
window.getRandomQuestion = getRandomQuestionAlumno;
window.showNotification = showNotification;