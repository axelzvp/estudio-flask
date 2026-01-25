const API_URL = '/api';
let currentQuestion = null;
let allQuestions = [];
let allSubjects = [];
let currentSubjectFilter = 'todos';
let currentTopicFilter = 'todos';
let lastFocusedTextarea = null;


// Variables para modo estudio
let studySelectedSubject = null;
let studySelectedTopic = 'todos';

// Variables para modo edición
let currentEditQuestionId = null;
let isEditMode = false;

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', function() {
    initApp();
});

function initApp() {
    // Navegación entre páginas
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', function() {
            if (this.id === 'openModalBtn') {
                openModal();
                return;
            }
            
            // Remover active de todos
            document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            
            // Activar el seleccionado
            this.classList.add('active');
            const pageId = this.dataset.page + 'Page';
            document.getElementById(pageId).classList.add('active');
            
            // Cargar datos específicos de cada página
            if (this.dataset.page === 'questions') {
                loadQuestionsPage();
            } else if (this.dataset.page === 'stats') {
                loadStatsPage();
            } else if (this.dataset.page === 'study') {
                loadStudyPage();
            }
        });
    });
    
    // Modal de preguntas
    document.getElementById('openModalBtn').addEventListener('click', openModal);
    document.getElementById('openModalFromListBtn').addEventListener('click', openModal);
    document.getElementById('addFirstQuestionBtn').addEventListener('click', openModal);
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('cancelModalBtn').addEventListener('click', closeModal);
    document.getElementById('saveQuestionBtn').addEventListener('click', saveQuestion);
    
    // Modal de ayuda
    document.getElementById('showHelpBtn').addEventListener('click', function() {
        document.getElementById('helpModal').classList.add('active');
    });
    document.querySelectorAll('#helpModal .modal-close, #helpModal .btn-primary').forEach(btn => {
        btn.addEventListener('click', function() {
            document.getElementById('helpModal').classList.remove('active');
        });
    });
    
    // Modo estudio
    document.getElementById('getQuestionBtn').addEventListener('click', getRandomQuestion);
    document.getElementById('showAnswerBtn').addEventListener('click', showAnswer);
    
    // Filtros en página de preguntas
    document.getElementById('subjectFilter').addEventListener('change', function() {
        updateTopicFilter();
    });    
    document.getElementById('topicFilter').addEventListener('change', applyFilters);
    //document.getElementById('difficultyFilter').addEventListener('change', applyFilters);
    document.getElementById('clearFiltersBtn').addEventListener('click', clearFilters);
    document.getElementById('clearFiltersMessageBtn').addEventListener('click', clearFilters);
    
    // Materia personalizada en modal
    const modalSubjectSelect = document.getElementById('modalSubject');
    const modalNewSubjectInput = document.getElementById('modalNewSubject');
    
    // Añadir opción "Otra materia" al select
    const otherOption = document.createElement('option');
    otherOption.value = '_new_';
    otherOption.textContent = '✏️ Otra materia...';
    modalSubjectSelect.appendChild(otherOption);
    
    modalSubjectSelect.addEventListener('change', function() {
        if (this.value === '_new_') {
            modalNewSubjectInput.style.display = 'block';
            modalNewSubjectInput.focus();
        } else {
            modalNewSubjectInput.style.display = 'none';
        }
    });
    
    // Checkbox para opciones múltiples
    const hasOptionsCheckbox = document.getElementById('hasOptionsCheckbox');
    if (hasOptionsCheckbox) {
        hasOptionsCheckbox.addEventListener('change', toggleOptions);
    }
    
    // Inicializar teclado matemático
    initMathToolbar();
    
    // Cargar datos iniciales
    loadAllData();
}

async function loadAllData() {
    try {
        // Cargar materias
        const subjectsResponse = await fetch(`${API_URL}/subjects`);
        const subjectsData = await subjectsResponse.json();
        
        if (subjectsData.success) {
            allSubjects = subjectsData.subjects;
            updateSidebarStats();
        }
        
        // Cargar preguntas
        const questionsResponse = await fetch(`${API_URL}/questions`);
        const questionsData = await questionsResponse.json();
        
        if (questionsData.success) {
            allQuestions = questionsData.questions;
            updateSidebarStats();
            
            // Actualizar el selector de materias en modo estudio
            await loadStudySubjects();
        }
        
        // Cargar datos específicos de la página activa
        const activePage = document.querySelector('.page.active').id;
        if (activePage === 'studyPage') {
            await loadStudyPage();
        } else if (activePage === 'questionsPage') {
            await loadQuestionsPage();
        } else if (activePage === 'statsPage') {
            await loadStatsPage();
        }
        
        // Verificar si hay preguntas
        checkIfNoQuestions();
        
    } catch (error) {
        console.error('Error cargando datos:', error);
        showNotification('Error al cargar los datos', 'error');
    }
}






async function deleteQuestion(id) {
    if (!confirm('¿Estás seguro de eliminar esta pregunta?')) return;
    
    try {
        console.log('Intentando eliminar pregunta con ID:', id); // Para debug
        
        const response = await fetch(`${API_URL}/questions/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        console.log('Respuesta del servidor:', data); // Para debug
        
        if (data.success) {
            showNotification('✅ Pregunta eliminada', 'success');
            
            // Actualizar lista local de preguntas
            allQuestions = allQuestions.filter(q => q._id !== id);
            
            // Recargar datos
            await loadAllData();
            
            // Si la pregunta eliminada es la que se está mostrando
            if (currentQuestion && currentQuestion._id === id) {
                document.getElementById('questionCard').style.display = 'none';
                currentQuestion = null;
                showNotification('Pregunta actual eliminada, obtén una nueva', 'info');
            }
        } else {
            showNotification('❌ Error: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error eliminando pregunta:', error);
        showNotification('❌ Error de conexión al eliminar', 'error');
    }
}



// ========== FUNCIONES PARA MODO ESTUDIO ==========
async function loadStudyPage() {
    if (studySelectedSubject === null) {
        studySelectedSubject = 'todos';
    }
    
    await loadStudySubjects();
    await loadStudyTopics();
    checkIfNoQuestions();
}

async function loadStudySubjects() {
    const container = document.getElementById('subjectButtons');
    if (!container) return;
    
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;"><i class="fas fa-spinner loading"></i> Cargando materias...</div>';
    
    try {
        const response = await fetch(`${API_URL}/subjects`);
        const data = await response.json();
        
        if (data.success && data.subjects.length > 0) {
            allSubjects = data.subjects;
            container.innerHTML = '';
            
            // Agregar "Todas las materias"
            const allBtn = document.createElement('div');
            allBtn.className = studySelectedSubject === 'todos' ? 'subject-btn active' : 'subject-btn';
            allBtn.innerHTML = `
                <i class="fas fa-layer-group"></i> Todas las materias
                <span class="count">${allQuestions.length}</span>
            `;
            allBtn.dataset.subject = 'todos';
            allBtn.addEventListener('click', function() {
                document.querySelectorAll('.subject-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                studySelectedSubject = 'todos';
                studySelectedTopic = 'todos';
                loadStudyTopics();
                document.getElementById('getQuestionBtn').disabled = false;
                document.getElementById('questionCard').style.display = 'none';
                document.getElementById('answerSection').classList.remove('show');
                document.getElementById('showAnswerBtn').style.display = 'none';
            });
            container.appendChild(allBtn);
            
            // Agregar cada materia
            allSubjects.forEach(subject => {
                const count = allQuestions.filter(q => q.subject === subject).length;
                if (count === 0) return;
                
                const btn = document.createElement('div');
                btn.className = studySelectedSubject === subject ? 'subject-btn active' : 'subject-btn';
                btn.innerHTML = `
                    <i class="fas fa-book"></i> ${subject}
                    <span class="count">${count}</span>
                `;
                btn.dataset.subject = subject;
                btn.addEventListener('click', function() {
                    document.querySelectorAll('.subject-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    studySelectedSubject = subject;
                    studySelectedTopic = 'todos';
                    loadStudyTopics();
                    document.getElementById('getQuestionBtn').disabled = false;
                    document.getElementById('questionCard').style.display = 'none';
                    document.getElementById('answerSection').classList.remove('show');
                    document.getElementById('showAnswerBtn').style.display = 'none';
                });
                container.appendChild(btn);
            });
            
            if (container.children.length === 0) {
                container.innerHTML = `
                    <div style="padding: 20px; text-align: center; color: #666;">
                        <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 10px;"></i>
                        <p>No hay materias disponibles</p>
                    </div>
                `;
            }
        } else {
            container.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #666;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 10px;"></i>
                    <p>No se pudieron cargar las materias</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error cargando materias:', error);
        container.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #666;">
                <i class="fas fa-exclamation-circle" style="font-size: 2rem; margin-bottom: 10px;"></i>
                <p>Error al cargar las materias</p>
            </div>
        `;
    }
}

async function loadStudyTopics() {
    const container = document.getElementById('studyTopicButtons');
    const topicSelector = document.getElementById('topicSelectorContainer');
    
    if (!studySelectedSubject || studySelectedSubject === 'todos') {
        topicSelector.style.display = 'none';
        return;
    }
    
    try {
        container.innerHTML = '<div style="padding: 10px; text-align: center; color: #666;"><i class="fas fa-spinner loading"></i> Cargando temas...</div>';
        topicSelector.style.display = 'block';
        
        const response = await fetch(`${API_URL}/subjects/${encodeURIComponent(studySelectedSubject)}/topics`);
        const data = await response.json();
        
        if (data.success && data.topics.length > 0) {
            container.innerHTML = '';
            document.getElementById('currentSubjectName').textContent = studySelectedSubject;
            
            // Agregar "Todos los temas"
            const allBtn = document.createElement('div');
            allBtn.className = studySelectedTopic === 'todos' ? 'topic-btn-with-action all-topics active' : 'topic-btn-with-action all-topics';
            allBtn.innerHTML = `
                <div class="topic-btn-content">
                    <i class="fas fa-layer-group"></i> Todos los temas
                </div>
                <button class="topic-action-btn" onclick="getRandomQuestionFromTopic('todos')">
                    <i class="fas fa-dice"></i> Pregunta
                </button>
            `;
            allBtn.dataset.topic = 'todos';
            allBtn.addEventListener('click', function(e) {
                if (!e.target.closest('.topic-action-btn')) {
                    document.querySelectorAll('.topic-btn-with-action').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    studySelectedTopic = 'todos';
                }
            });
            container.appendChild(allBtn);
            
            // Agregar cada tema con botón de acción
            data.topics.forEach(topic => {
                const btn = document.createElement('div');
                btn.className = studySelectedTopic === topic ? 'topic-btn-with-action active' : 'topic-btn-with-action';
                btn.innerHTML = `
                    <div class="topic-btn-content">
                        <i class="fas fa-folder"></i> ${topic}
                    </div>
                    <button class="topic-action-btn" onclick="getRandomQuestionFromTopic('${topic}')">
                        <i class="fas fa-dice"></i> Pregunta
                    </button>
                `;
                btn.dataset.topic = topic;
                btn.addEventListener('click', function(e) {
                    if (!e.target.closest('.topic-action-btn')) {
                        document.querySelectorAll('.topic-btn-with-action').forEach(b => b.classList.remove('active'));
                        this.classList.add('active');
                        studySelectedTopic = topic;
                    }
                });
                container.appendChild(btn);
            });
            
        } else {
            topicSelector.style.display = 'none';
        }
    } catch (error) {
        console.error('Error cargando temas:', error);
        topicSelector.style.display = 'none';
    }
}

async function getRandomQuestion() {        
    if (!studySelectedSubject) {
        showNotification('Primero selecciona una materia', 'warning');
        return;
    }

    if (allQuestions.length === 0) {
        showNotification('No hay preguntas disponibles', 'warning');
        return;
    }

    let url = `${API_URL}/questions/random`;
    const params = [];

    if (studySelectedSubject !== 'todos') {
        params.push(`subject=${encodeURIComponent(studySelectedSubject)}`);
    }

    if (studySelectedTopic !== 'todos') {
        params.push(`topic=${encodeURIComponent(studySelectedTopic)}`);
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
            displayQuestion(currentQuestion);

            document.getElementById('questionCard').style.display = 'block';
            document.getElementById('answerSection').classList.remove('show');
            document.getElementById('noQuestionsMessage').style.display = 'none';

            showNotification('✅ Pregunta cargada', 'success');
        } else {
            showNotification('No hay preguntas con estos filtros', 'warning');
        }
    } catch (error) {
        console.error('Error obteniendo pregunta:', error);
        showNotification('Error de conexión', 'error');
    } finally {
        getBtn.innerHTML = originalText;
        getBtn.disabled = false;
    }
}


async function getRandomQuestionFromTopic(topic) {
    studySelectedTopic = topic;
    
    document.querySelectorAll('.topic-btn-with-action').forEach(b => b.classList.remove('active'));
    
    const activeBtn = Array.from(document.querySelectorAll('.topic-btn-with-action'))
        .find(b => b.dataset.topic === topic);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    await getRandomQuestion();
}

function displayQuestion(question) {
    // Actualizar badges del modal
    document.getElementById('modalQuestionSubject').textContent = question.subject;
    document.getElementById('modalQuestionTopic').textContent = question.topic;
    document.getElementById('modalQuestionUniversity').textContent = question.university;
    
    // Actualizar texto de la pregunta en el modal
    document.getElementById('modalQuestionText').innerHTML = question.question;
    
    // Limpiar opciones anteriores
    const optionsContainer = document.getElementById('modalOptionsContainer');
    optionsContainer.innerHTML = '';
    
    // Verificar si es pregunta con opciones múltiples
    if (question.has_options && question.options && question.options.length > 0) {
        let optionsHTML = '';
        
        question.options.forEach((option, index) => {
            const letter = String.fromCharCode(65 + index);
            
            optionsHTML += `
                <div class="option-card" onclick="checkAnswer(${index}, '${question._id}')" data-index="${index}">
                    <div class="option-letter-circle">${letter}</div>
                    <div class="option-content">${option}</div>
                </div>
            `;
        });
        
        optionsContainer.innerHTML = optionsHTML;
    }
    
    // Actualizar respuesta y solución en el modal (pero ocultar)
    document.getElementById('modalAnswerText').innerHTML = question.answer || question.correct_answer || '';
    document.getElementById('modalSolutionText').innerHTML = question.solution || '';
    document.getElementById('modalAnswerSection').style.display = 'none';
    
    // Mostrar el modal
    document.getElementById('studyQuestionModal').style.display = 'flex';
    
    // Actualizar MathJax
    if (window.MathJax) {
        MathJax.typesetPromise()
            .catch(err => console.log('MathJax error:', err));
    }
}


function closeStudyModal() {
    document.getElementById('studyQuestionModal').style.display = 'none';
}

function showModalAnswer() {
    document.getElementById('modalAnswerSection').style.display = 'block';
    if (window.MathJax) {
        MathJax.typesetPromise()
            .catch(err => console.log('MathJax error:', err));
    }
}

function showAnswer() {
    if (!currentQuestion) return;
    
    const answerSection = document.getElementById('answerText');
    const solutionSection = document.getElementById('solutionText');
    
    // Mostrar la respuesta
    answerSection.innerHTML = `
        <div class="open-answer">
            <h4><i class="fas fa-check-circle"></i> Respuesta</h4>
            <div>${currentQuestion.answer || currentQuestion.correct_answer || ''}</div>
        </div>
    `;
    
    // Mostrar la solución si existe
    if (currentQuestion.solution && currentQuestion.solution.trim() !== '') {
        solutionSection.innerHTML = `
            <div class="solution-box">
                <h4><i class="fas fa-list-ol"></i> Solución Detallada</h4>
                <div>${currentQuestion.solution}</div>
            </div>
        `;
    }
    
    // Mostrar la sección de respuesta
    document.getElementById('answerSection').classList.add('show');
    // Ocultar el botón de mostrar respuesta
    document.getElementById('showAnswerBtn').style.display = 'none';
    
    if (window.MathJax) {
        MathJax.typesetPromise()
            .catch(err => console.log('MathJax error:', err));
    }
}

// Función para verificar respuesta seleccionada
function checkAnswer(selectedIndex, questionId) {
    const question = allQuestions.find(q => q._id === questionId);
    if (!question || !question.has_options) return;
    
    const optionCards = document.querySelectorAll('#modalOptionsContainer .option-card');
    const isCorrect = selectedIndex === question.correct_option;
    
    // Deshabilitar todas las opciones
    optionCards.forEach(card => {
        card.style.cursor = 'not-allowed';
        card.onclick = null;
    });
    
    // Marcar la opción seleccionada
    const selectedCard = optionCards[selectedIndex];
    if (selectedCard) {
        if (isCorrect) {
            selectedCard.classList.add('correct');
            showNotification('✅ ¡Respuesta correcta!', 'success');
        } else {
            selectedCard.classList.add('incorrect');
            showNotification('❌ Respuesta incorrecta', 'error');
        }
    }
    
    // Marcar la opción correcta (si el usuario se equivocó)
    if (!isCorrect && question.correct_option >= 0) {
        const correctCard = optionCards[question.correct_option];
        if (correctCard) {
            correctCard.classList.add('correct');
        }
    }
    
    // Mostrar solución si existe
    if (question.solution && question.solution.trim() !== '') {
        document.getElementById('modalSolutionText').innerHTML = 
            `<div class="solution-box">
                <h4><i class="fas fa-list-ol"></i> Solución Detallada</h4>
                <div>${question.solution}</div>
            </div>`;
    }
    
    // Actualizar contadores en el backend
    fetch(`${API_URL}/questions/${questionId}/answer`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            correct: isCorrect,
            selected_option: selectedIndex
        })
    }).catch(console.error);
}
// ========== FUNCIONES PARA PÁGINA DE PREGUNTAS ==========
async function loadQuestionsPage() {
    await loadFilterOptions();
    applyFilters();
}

async function loadFilterOptions() {
    const subjectSelect = document.getElementById('subjectFilter');
    subjectSelect.innerHTML = '<option value="todos">Todas las materias</option>';
    
    allSubjects.forEach(subject => {
        const option = document.createElement('option');
        option.value = subject;
        option.textContent = subject;
        subjectSelect.appendChild(option);
    });
}

function applyFilters() {
    currentSubjectFilter = document.getElementById('subjectFilter').value;
    currentTopicFilter = document.getElementById('topicFilter').value;
    currentUniversityFilter = document.getElementById('universityFilter').value;
    
    let filteredQuestions = allQuestions;
    
    if (currentSubjectFilter !== 'todos') {
        filteredQuestions = filteredQuestions.filter(q => q.subject === currentSubjectFilter);
    }
    
    if (currentTopicFilter !== 'todos') {
        filteredQuestions = filteredQuestions.filter(q => q.topic === currentTopicFilter);
    }
    
    if (currentUniversityFilter !== 'todos') {
        filteredQuestions = filteredQuestions.filter(q => q.university === currentUniversityFilter);
    }
    
    displayFilteredQuestions(filteredQuestions);
}

function displayFilteredQuestions(questions) {
    const container = document.getElementById('questionsList');
    const noQuestionsMsg = document.getElementById('noQuestionsMessageList');
    
    if (questions.length === 0) {
        container.style.display = 'none';
        noQuestionsMsg.style.display = 'block';
        return;
    }
    
    container.style.display = 'grid';
    noQuestionsMsg.style.display = 'none';
    container.innerHTML = '';
    
    questions.forEach(question => {
        const item = document.createElement('div');
        item.className = 'question-item';
        item.innerHTML = `
            <div class="question-header">
                <div>
                    <span class="question-subject">${question.subject}</span>
                    <span class="question-topic">${question.topic}</span>
                </div>
                <span class="question-university" style="background: #e3f2fd; color: #1976d2; padding: 3px 8px; border-radius: 12px; font-size: 0.8rem;">
                    <i class="fas fa-university"></i> ${question.university || 'N/A'}
                </span>
            </div>
            <div class="question-content">
                ${question.question}
            </div>
            <div class="question-footer">
                <div class="question-stats">
                    <span><i class="fas fa-eye"></i> ${question.times_shown || 0} veces vista</span>
                    <span><i class="fas fa-calendar"></i> ${formatDate(question.created_at)}</span>
                </div>
                <div>
                    <button class="btn btn-warning btn-sm" onclick="editQuestion('${question._id}')">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteQuestion('${question._id}')">
                        <i class="fas fa-trash"></i> Eliminar
                    </button>
                </div>
            </div>
        `;
        container.appendChild(item);
    });
    
    if (window.MathJax) {
        MathJax.typesetPromise()
            .catch(err => console.log('MathJax error:', err));
    }
}
function clearFilters() {
    document.getElementById('subjectFilter').value = 'todos';
    document.getElementById('topicFilter').value = 'todos';
    document.getElementById('difficultyFilter').value = 'todos';
    applyFilters();
}

// ========== FUNCIONES GENERALES ==========
// ========== FUNCIONES GENERALES ==========
function openModal() {
    // Primero asegurarse de resetear modo edición
    isEditMode = false;
    currentEditQuestionId = null;
    
    document.getElementById('questionModal').classList.add('active');
    
    // Resetear campos
    document.getElementById('modalQuestion').value = '';
    document.getElementById('modalAnswer').value = '';
    document.getElementById('modalSolution').value = '';
    document.getElementById('modalTopic').value = '';
    document.getElementById('modalUniversity').value = 'UNAM';
    document.getElementById('modalNewUniversity').style.display = 'none';
    document.getElementById('modalNewUniversity').value = '';
    document.getElementById('modalSubject').value = 'Matemáticas';
    document.getElementById('modalNewSubject').style.display = 'none';
    document.getElementById('modalNewSubject').value = '';
    
    // Resetear opciones
    if (document.getElementById('hasOptionsCheckbox')) {
        document.getElementById('hasOptionsCheckbox').checked = false;
        toggleOptions();
        
        // Limpiar campos de opciones
        document.getElementById('optionA').value = '';
        document.getElementById('optionB').value = '';
        document.getElementById('optionC').value = '';
        document.getElementById('optionD').value = '';
        
        // Limpiar selección de opción correcta
        document.querySelectorAll('input[name="correctOption"]').forEach(radio => {
            radio.checked = false;
        });
    }
    
    // Restaurar título y texto del botón
    document.querySelector('#questionModal .modal-title').innerHTML = 
        '<i class="fas fa-plus-circle"></i> Nueva Pregunta';
    document.getElementById('saveQuestionBtn').innerHTML = 
        '<i class="fas fa-save"></i> Guardar Pregunta';
    
    // Enfocar primer campo
    document.getElementById('modalQuestion').focus();
    
    // Resaltar toolbar de pregunta
    document.querySelectorAll('.math-toolbar').forEach(toolbar => {
        toolbar.classList.remove('active');
    });
    const questionToolbar = document.getElementById('questionMathToolbar');
    if (questionToolbar) {
        questionToolbar.classList.add('active');
    }
}

function closeModal() {
    document.getElementById('questionModal').classList.remove('active');
    
    // Resetear campos
    document.getElementById('modalQuestion').value = '';
    document.getElementById('modalAnswer').value = '';
    document.getElementById('modalSolution').value = '';
    document.getElementById('modalTopic').value = '';
    document.getElementById('modalUniversity').value = 'UNAM';  // <-- Reset university
    document.getElementById('modalNewUniversity').style.display = 'none';
    document.getElementById('modalNewUniversity').value = '';
    document.getElementById('modalSubject').value = 'Matemáticas';
    document.getElementById('modalNewSubject').style.display = 'none';
    document.getElementById('modalNewSubject').value = '';
    
    // Resetear opciones
    if (document.getElementById('hasOptionsCheckbox')) {
        document.getElementById('hasOptionsCheckbox').checked = false;
        toggleOptions();
        
        document.getElementById('optionA').value = '';
        document.getElementById('optionB').value = '';
        document.getElementById('optionC').value = '';
        document.getElementById('optionD').value = '';
        
        document.querySelectorAll('input[name="correctOption"]').forEach(radio => {
            radio.checked = false;
        });
    }
    
    // Resetear modo edición
    isEditMode = false;
    currentEditQuestionId = null;
    
    // Restaurar título y texto del botón
    document.querySelector('#questionModal .modal-title').innerHTML = 
        '<i class="fas fa-plus-circle"></i> Nueva Pregunta';
    document.getElementById('saveQuestionBtn').innerHTML = 
        '<i class="fas fa-save"></i> Guardar Pregunta';
}

async function saveQuestion() {
    // 1. Obtener y validar materia
    const subject = document.getElementById('modalSubject').value;
    const newSubject = document.getElementById('modalNewSubject').value.trim();
    const finalSubject = subject === '_new_' && newSubject ? newSubject : subject;
    
    if (!finalSubject) {
        showNotification('La materia es requerida', 'error');
        return;
    }
    
    // 2. Obtener y validar tema
    const topic = document.getElementById('modalTopic').value.trim();
    if (!topic) {
        showNotification('El tema es requerido', 'error');
        return;
    }
    
    // 3. Obtener y validar pregunta
    const questionText = document.getElementById('modalQuestion').value.trim();
    if (!questionText) {
        showNotification('La pregunta es requerida', 'error');
        return;
    }
    
    // 4. Obtener universidad
    const universitySelect = document.getElementById('modalUniversity').value;
    const newUniversity = document.getElementById('modalNewUniversity').value.trim();
    const finalUniversity = (universitySelect === '_new_' && newUniversity) 
        ? newUniversity 
        : universitySelect;
    
    // 5. Preparar objeto base de datos
    const questionData = {
        subject: finalSubject,
        topic: topic,
        question: questionText,
        university: finalUniversity,  // <-- Solo university, NO difficulty
        has_options: document.getElementById('hasOptionsCheckbox') ? 
            document.getElementById('hasOptionsCheckbox').checked : false,
        solution: document.getElementById('modalSolution').value.trim(),
    };
    
    // 8. Manejar opciones múltiples vs respuesta abierta
    if (questionData.has_options) {
        // Obtener opciones
        const options = [
            document.getElementById('optionA').value.trim(),
            document.getElementById('optionB').value.trim(),
            document.getElementById('optionC').value.trim(),
            document.getElementById('optionD').value.trim()
        ];
        
        // Validar opciones
        const emptyOptions = options.filter(opt => !opt);
        if (emptyOptions.length > 0) {
            showNotification('Todas las opciones deben tener texto', 'error');
            return;
        }
        
        // Obtener opción correcta
        const correctOptionInput = document.querySelector('input[name="correctOption"]:checked');
        if (!correctOptionInput) {
            showNotification('Debes seleccionar la opción correcta', 'error');
            return;
        }
        
        const correctOptionIndex = parseInt(correctOptionInput.value);
        
        // Agregar datos de opciones
        questionData.options = options;
        questionData.correct_option = correctOptionIndex;
        questionData.correct_answer = `${String.fromCharCode(65 + correctOptionIndex)}. ${options[correctOptionIndex]}`;
        questionData.answer = ''; // Para compatibilidad
        
    } else {
        // Pregunta abierta
        const answer = document.getElementById('modalAnswer').value.trim();
        if (!answer) {
            showNotification('La respuesta es requerida para preguntas abiertas', 'error');
            return;
        }
        
        questionData.options = [];
        questionData.correct_option = -1;
        questionData.correct_answer = answer; // Para preguntas abiertas
        questionData.answer = answer; // Para compatibilidad
    }
    
    // 9. Mostrar estado de carga
    const saveBtn = document.getElementById('saveQuestionBtn');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner loading"></i> ' + 
        (isEditMode ? 'Actualizando...' : 'Guardando...');
    saveBtn.disabled = true;
    
    try {
        let response;
        let endpoint;
        
        if (isEditMode && currentEditQuestionId) {
            // Modo edición
            endpoint = `${API_URL}/questions/${currentEditQuestionId}`;
            response = await fetch(endpoint, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(questionData)
            });
        } else {
            // Modo creación
            endpoint = `${API_URL}/questions`;
            response = await fetch(endpoint, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(questionData)
            });
        }
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(
                isEditMode ? '✅ Pregunta actualizada correctamente' : '✅ Pregunta guardada correctamente', 
                'success'
            );
            closeModal();
            await loadAllData();
        } else {
            showNotification('❌ Error: ' + (data.error || 'Error desconocido'), 'error');
            console.error('Error del servidor:', data);
        }
    } catch (error) {
        console.error('Error guardando pregunta:', error);
        showNotification('❌ Error de conexión: ' + error.message, 'error');
    } finally {
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

async function editQuestion(id) {
    try {
        const question = allQuestions.find(q => q._id === id);
        if (!question) {
            showNotification('Pregunta no encontrada', 'error');
            return;
        }
        
        // Activar modo edición
        isEditMode = true;
        currentEditQuestionId = id;
        
        // Cargar datos básicos
        document.getElementById('modalSubject').value = question.subject;
        document.getElementById('modalTopic').value = question.topic;
        document.getElementById('modalQuestion').value = question.question;
        document.getElementById('modalSolution').value = question.solution || '';
        document.getElementById('modalUniversity').value = question.university || 'UNAM';  // <-- Cargar university
        
        // Cargar opciones si las tiene
        if (question.has_options && question.options && question.options.length > 0) {
            if (document.getElementById('hasOptionsCheckbox')) {
                document.getElementById('hasOptionsCheckbox').checked = true;
                toggleOptions();
                
                // Llenar opciones
                if (question.options[0]) document.getElementById('optionA').value = question.options[0];
                if (question.options[1]) document.getElementById('optionB').value = question.options[1];
                if (question.options[2]) document.getElementById('optionC').value = question.options[2];
                if (question.options[3]) document.getElementById('optionD').value = question.options[3];
                
                // Marcar opción correcta
                if (question.correct_option >= 0 && question.correct_option < 4) {
                    const correctRadio = document.getElementById(`correctOption${String.fromCharCode(65 + question.correct_option)}`);
                    if (correctRadio) {
                        correctRadio.checked = true;
                    }
                }
            }
        } else {
            // Pregunta abierta
            if (document.getElementById('hasOptionsCheckbox')) {
                document.getElementById('hasOptionsCheckbox').checked = false;
                toggleOptions();
            }
            document.getElementById('modalAnswer').value = question.answer || question.correct_answer || '';
        }
        
        // Cambiar título del modal
        document.querySelector('#questionModal .modal-title').innerHTML = 
            '<i class="fas fa-edit"></i> Editar Pregunta';
        
        // Cambiar texto del botón de guardar
        document.getElementById('saveQuestionBtn').innerHTML = 
            '<i class="fas fa-save"></i> Actualizar Pregunta';
        
        // Abrir modal
        document.getElementById('questionModal').classList.add('active');
        
        // Enfocar primer campo
        document.getElementById('modalQuestion').focus();
        
    } catch (error) {
        console.error('Error preparando edición:', error);
        showNotification('Error al cargar pregunta para editar', 'error');
    }
}

function displayFilteredQuestions(questions) {
    const container = document.getElementById('questionsList');
    const noQuestionsMsg = document.getElementById('noQuestionsMessageList');
    
    if (questions.length === 0) {
        container.style.display = 'none';
        noQuestionsMsg.style.display = 'block';
        return;
    }
    
    container.style.display = 'grid';
    noQuestionsMsg.style.display = 'none';
    container.innerHTML = '';
    
    questions.forEach(question => {
        const item = document.createElement('div');
        item.className = 'question-item';
        item.innerHTML = `
            <div class="question-header">
                <div>
                    <span class="question-subject">${question.subject}</span>
                    <span class="question-topic">${question.topic}</span>
                </div>
                <span class="question-university" style="background: #e3f2fd; color: #1976d2; padding: 3px 8px; border-radius: 12px; font-size: 0.8rem;">
                    <i class="fas fa-university"></i> ${question.university || 'N/A'}
                </span>
            </div>
            <div class="question-content">
                ${question.question}
            </div>
            <div class="question-footer">
                <div class="question-stats">
                    <span><i class="fas fa-eye"></i> ${question.times_shown || 0} veces vista</span>
                    <span><i class="fas fa-calendar"></i> ${formatDate(question.created_at)}</span>
                </div>
                <div>
                    <button class="btn btn-warning btn-sm" onclick="editQuestion('${question._id}')">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteQuestion('${question._id}')">
                        <i class="fas fa-trash"></i> Eliminar
                    </button>
                </div>
            </div>
        `;
        container.appendChild(item);
    });
    
    if (window.MathJax) {
        MathJax.typesetPromise()
            .catch(err => console.log('MathJax error:', err));
    }
}

async function loadStatsPage() {
    try {
        const response = await fetch(`${API_URL}/stats`);
        const data = await response.json();
        
        if (data.success) {
            const stats = data.stats;
            
            const subjectsGrid = document.getElementById('subjectsStats');
            subjectsGrid.innerHTML = '';
            
            stats.subjects.forEach(subject => {
                const percentage = ((subject.count / stats.total_questions) * 100).toFixed(1);
                const card = document.createElement('div');
                card.className = 'stat-card';
                card.innerHTML = `
                    <h3>${subject._id}</h3>
                    <div class="stat-number">${subject.count}</div>
                    <div style="margin-top: 10px; color: #666; font-size: 0.9rem;">
                        ${percentage}% del total
                    </div>
                `;
                subjectsGrid.appendChild(card);
            });
            
            // Estadísticas por universidad
            const difficultyChart = document.getElementById('difficultyChart');
            if (stats.universities && stats.universities.length > 0) {
                let chartHTML = '<div style="margin-top: 20px;">';
                stats.universities.forEach(univ => {
                    const percentage = ((univ.count / stats.total_questions) * 100).toFixed(1);
                    chartHTML += `
                        <div style="margin-bottom: 15px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                <span>${univ._id}</span>
                                <span>${univ.count} (${percentage}%)</span>
                            </div>
                            <div style="height: 10px; background: #e0e0e0; border-radius: 5px; overflow: hidden;">
                                <div style="width: ${percentage}%; height: 100%; background: var(--primary);"></div>
                            </div>
                        </div>
                    `;
                });
                chartHTML += '</div>';
                difficultyChart.innerHTML = chartHTML;
            } else {
                difficultyChart.innerHTML = '<p style="text-align: center; color: #666;">No hay estadísticas de universidades disponibles</p>';
            }
            
            // Top temas
            const topTopicsChart = document.getElementById('topTopicsChart');
            if (stats.top_topics && stats.top_topics.length > 0) {
                topTopicsChart.innerHTML = stats.top_topics.map(topic => `
                    <div style="margin-bottom: 15px; padding: 10px; background: #f8f9ff; border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 600;">${topic._id}</span>
                            <span style="color: var(--primary); font-weight: bold;">${topic.count} preguntas</span>
                        </div>
                        <div style="height: 8px; background: #e0e0e0; border-radius: 4px; margin-top: 8px; overflow: hidden;">
                            <div style="width: ${stats.total_questions > 0 ? (topic.count / stats.total_questions * 100) : 0}%; height: 100%; background: var(--primary);"></div>
                        </div>
                    </div>
                `).join('');
            } else {
                topTopicsChart.innerHTML = '<p style="text-align: center; color: #666;">No hay temas disponibles</p>';
            }
            
        }
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
        showNotification('Error al cargar estadísticas', 'error');
    }
}


function updateSidebarStats() {
    const total = allQuestions.length;
    const subjects = allSubjects.length;
    const shown = allQuestions.reduce((sum, q) => sum + (q.times_shown || 0), 0);
    
    document.getElementById('sidebarTotal').textContent = total;
    document.getElementById('sidebarSubjects').textContent = subjects;
    document.getElementById('sidebarShown').textContent = shown;
}

async function loadStatsPage() {
    try {
        const response = await fetch(`${API_URL}/stats`);
        const data = await response.json();
        
        if (data.success) {
            const stats = data.stats;
            
            const subjectsGrid = document.getElementById('subjectsStats');
            subjectsGrid.innerHTML = '';
            
            stats.subjects.forEach(subject => {
                const percentage = ((subject.count / stats.total_questions) * 100).toFixed(1);
                const card = document.createElement('div');
                card.className = 'stat-card';
                card.innerHTML = `
                    <h3>${subject._id}</h3>
                    <div class="stat-number">${subject.count}</div>
                    <div style="margin-top: 10px; color: #666; font-size: 0.9rem;">
                        ${percentage}% del total
                    </div>
                `;
                subjectsGrid.appendChild(card);
            });
            
            const difficultyChart = document.getElementById('difficultyChart');
            const total = stats.total_questions;
            
            difficultyChart.innerHTML = `
                <div style="display: flex; align-items: center; height: 40px; margin-bottom: 15px;">
                    <div style="width: ${total > 0 ? (stats.difficulty.facil / total * 100) : 0}%; 
                         background: #4caf50; height: 100%; border-radius: 4px 0 0 4px;">
                    </div>
                    <div style="width: ${total > 0 ? (stats.difficulty.media / total * 100) : 0}%; 
                         background: #ff9800; height: 100%;">
                    </div>
                    <div style="width: ${total > 0 ? (stats.difficulty.dificil / total * 100) : 0}%; 
                         background: #f44336; height: 100%; border-radius: 0 4px 4px 0;">
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                    <div style="text-align: center;">
                        <div style="width: 20px; height: 20px; background: #4caf50; display: inline-block; border-radius: 3px;"></div>
                        <span style="margin-left: 8px;">Fácil: ${stats.difficulty.facil} (${total > 0 ? ((stats.difficulty.facil / total * 100).toFixed(1)) : 0}%)</span>
                    </div>
                    <div style="text-align: center;">
                        <div style="width: 20px; height: 20px; background: #ff9800; display: inline-block; border-radius: 3px;"></div>
                        <span style="margin-left: 8px;">Media: ${stats.difficulty.media} (${total > 0 ? ((stats.difficulty.media / total * 100).toFixed(1)) : 0}%)</span>
                    </div>
                    <div style="text-align: center;">
                        <div style="width: 20px; height: 20px; background: #f44336; display: inline-block; border-radius: 3px;"></div>
                        <span style="margin-left: 8px;">Difícil: ${stats.difficulty.dificil} (${total > 0 ? ((stats.difficulty.dificil / total * 100).toFixed(1)) : 0}%)</span>
                    </div>
                </div>
            `;
            
            const topTopicsChart = document.getElementById('topTopicsChart');
            topTopicsChart.innerHTML = stats.top_topics.map(topic => `
                <div style="margin-bottom: 15px; padding: 10px; background: #f8f9ff; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 600;">${topic._id}</span>
                        <span style="color: var(--primary); font-weight: bold;">${topic.count} preguntas</span>
                    </div>
                    <div style="height: 8px; background: #e0e0e0; border-radius: 4px; margin-top: 8px; overflow: hidden;">
                        <div style="width: ${total > 0 ? (topic.count / total * 100) : 0}%; height: 100%; background: var(--primary);"></div>
                    </div>
                </div>
            `).join('');
            
        }
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
        showNotification('Error al cargar estadísticas', 'error');
    }
}

function checkIfNoQuestions() {
    const studyPage = document.getElementById('studyPage');
    if (studyPage.classList.contains('active') && allQuestions.length === 0) {
        document.getElementById('noQuestionsMessage').style.display = 'block';
        document.getElementById('questionCard').style.display = 'none';
        document.getElementById('subjectSelectorContainer').style.display = 'none';
    } else if (studyPage.classList.contains('active')) {
        document.getElementById('noQuestionsMessage').style.display = 'none';
        document.getElementById('subjectSelectorContainer').style.display = 'block';
    }
}

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 4000);
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

async function updateTopicFilter() {
    const subject = document.getElementById('subjectFilter').value;
    const topicFilter = document.getElementById('topicFilter');
    
    // Guardar selección actual
    const currentTopic = topicFilter.value;
    
    // Limpiar opciones excepto la primera
    topicFilter.innerHTML = '<option value="todos">Todos los temas</option>';
    
    if (subject !== 'todos') {
        try {
            const response = await fetch(`${API_URL}/subjects/${encodeURIComponent(subject)}/topics`);
            const data = await response.json();
            
            if (data.success && data.topics.length > 0) {
                // Ordenar temas alfabéticamente
                data.topics.sort().forEach(topic => {
                    const option = document.createElement('option');
                    option.value = topic;
                    option.textContent = topic;
                    topicFilter.appendChild(option);
                });
                
                // Restaurar selección si aún existe
                if (data.topics.includes(currentTopic)) {
                    topicFilter.value = currentTopic;
                }
            }
        } catch (error) {
            console.error('Error cargando temas:', error);
        }
    }
    
    // Aplicar filtros
    applyFilters();
}

// ========== FUNCIONES PARA OPCIONES MÚLTIPLES ==========
function toggleOptions() {
    const hasOptionsCheckbox = document.getElementById('hasOptionsCheckbox');
    const optionsSection = document.getElementById('optionsSection');
    const openAnswerSection = document.getElementById('openAnswerSection');
    
    if (!hasOptionsCheckbox || !optionsSection || !openAnswerSection) return;
    
    const hasOptions = hasOptionsCheckbox.checked;
    
    if (hasOptions) {
        optionsSection.style.display = 'block';
        openAnswerSection.style.display = 'none';
        
        // Resaltar toolbar de respuesta
        document.querySelectorAll('.math-toolbar').forEach(toolbar => {
            toolbar.classList.remove('active');
        });
        
        const answerToolbar = document.getElementById('answerMathToolbar');
        if (answerToolbar) {
            answerToolbar.classList.add('active');
        }
        
        // NO enfocar automáticamente la opción A - dejar que el usuario decida
        // Solo preparar los eventos de foco
        setupOptionFocusEvents();
        
    } else {
        optionsSection.style.display = 'none';
        openAnswerSection.style.display = 'block';
        
        // Resaltar toolbar de respuesta
        document.querySelectorAll('.math-toolbar').forEach(toolbar => {
            toolbar.classList.remove('active');
        });
        
        const answerToolbar = document.getElementById('answerMathToolbar');
        if (answerToolbar) {
            answerToolbar.classList.add('active');
        }
        
        // Enfocar respuesta abierta
        setTimeout(() => {
            const modalAnswer = document.getElementById('modalAnswer');
            if (modalAnswer) {
                modalAnswer.focus();
                // Mover cursor al final del texto si ya hay algo
                if (modalAnswer.value) {
                    modalAnswer.selectionStart = modalAnswer.selectionEnd = modalAnswer.value.length;
                }
            }
        }, 50);
    }
}

// Función para configurar eventos de foco en las opciones
function setupOptionFocusEvents() {
    // Agregar eventos de foco a cada opción
    ['optionA', 'optionB', 'optionC', 'optionD'].forEach(optionId => {
        const optionField = document.getElementById(optionId);
        if (optionField) {
            // Remover eventos existentes para evitar duplicados
            optionField.removeEventListener('focus', handleOptionFocus);
            // Agregar nuevo evento
            optionField.addEventListener('focus', handleOptionFocus);
        }
    });
}

function handleOptionFocus(e) {
    lastFocusedTextarea = e.target;

    document.querySelectorAll('.math-toolbar').forEach(toolbar => {
        toolbar.classList.remove('active');
    });

    const answerToolbar = document.getElementById('answerMathToolbar');
    if (answerToolbar) {
        answerToolbar.classList.add('active');
    }
}

document.querySelectorAll(
    '#modalQuestion, #modalAnswer, #modalSolution, #optionA, #optionB, #optionC, #optionD'
).forEach(textarea => {
    textarea.addEventListener('focus', (e) => {
        lastFocusedTextarea = e.target;
    });
});


// Función para resaltar el toolbar de respuesta cuando se enfoca una opción
function highlightAnswerToolbar() {
    document.querySelectorAll('.math-toolbar').forEach(toolbar => {
        toolbar.classList.remove('active');
    });
    
    const answerToolbar = document.getElementById('answerMathToolbar');
    if (answerToolbar) {
        answerToolbar.classList.add('active');
    }
}
// ========== TECLADO MATEMÁTICO ==========
function initMathToolbar() {
    // Para cada botón matemático
    document.querySelectorAll('.math-btn').forEach(button => {
        button.addEventListener('click', function(e) {
            const symbol = this.getAttribute('data-symbol');
            
            // Obtener el elemento activo actualmente
        
            
            // Determinar qué campo debería recibir el texto
            
            let targetField = lastFocusedTextarea;
            
            if (!targetField) {
                showNotification('Primero haz clic en el campo donde quieres escribir', 'warning');
                return;
            }
            
            targetField.focus();
            insertAtCursor(targetField, symbol);
            
            
            // PRIMERO: Verificar si hay un campo enfocado que sea editable
            if (activeElement && (
                activeElement.id === 'modalQuestion' ||
                activeElement.id === 'modalAnswer' ||
                activeElement.id === 'modalSolution' ||
                activeElement.id === 'optionA' ||
                activeElement.id === 'optionB' ||
                activeElement.id === 'optionC' ||
                activeElement.id === 'optionD'
            )) {
                targetField = activeElement;
            }
            // SEGUNDO: Si no hay campo enfocado, usar la lógica basada en el toolbar
            else {
                const toolbar = this.closest('.math-toolbar');
                if (toolbar.id === 'questionMathToolbar') {
                    targetField = document.getElementById('modalQuestion');
                } else if (toolbar.id === 'answerMathToolbar') {
                    const hasOptions = document.getElementById('hasOptionsCheckbox') ? 
                        document.getElementById('hasOptionsCheckbox').checked : false;
                    
                    if (hasOptions) {
                        // En modo opciones, no asumir opción A por defecto
                        // Mostrar mensaje para que el usuario seleccione una opción primero
                        showNotification('Primero haz clic en la opción donde quieres escribir', 'warning');
                        return;
                    } else {
                        targetField = document.getElementById('modalAnswer');
                    }
                } else if (toolbar.id === 'solutionMathToolbar') {
                    targetField = document.getElementById('modalSolution');
                }
            }
            
            // Si no encontramos un campo válido, mostrar advertencia
            if (!targetField) {
                showNotification('Primero haz clic en el campo donde quieres insertar el símbolo', 'warning');
                return;
            }
            
            // Asegurarnos de que el campo tenga el foco
            if (targetField !== document.activeElement) {
                targetField.focus();
            }
            
            insertAtCursor(targetField, symbol);
        });
    });
    
    // Resaltar toolbar cuando se hace clic en un textarea
    document.querySelectorAll('#modalQuestion, #modalAnswer, #modalSolution, #optionA, #optionB, #optionC, #optionD').forEach(textarea => {
        textarea.addEventListener('focus', function() {
            // Determinar qué toolbar resaltar basado en el campo enfocado
            const toolbarId = getToolbarForField(this.id);
            if (toolbarId) {
                // Quitar resaltado de todos los toolbars
                document.querySelectorAll('.math-toolbar').forEach(toolbar => {
                    toolbar.classList.remove('active');
                });
                
                // Resaltar el toolbar correspondiente
                const toolbar = document.getElementById(toolbarId);
                if (toolbar) {
                    toolbar.classList.add('active');
                }
            }
        });
    });
    
    // También resaltar cuando se cambia el tipo de pregunta
    const hasOptionsCheckbox = document.getElementById('hasOptionsCheckbox');
    if (hasOptionsCheckbox) {
        hasOptionsCheckbox.addEventListener('change', function() {
            // Después de cambiar, verificar qué toolbar debería estar activo
            const activeElement = document.activeElement;
            if (activeElement) {
                const toolbarId = getToolbarForField(activeElement.id);
                if (toolbarId) {
                    document.querySelectorAll('.math-toolbar').forEach(toolbar => {
                        toolbar.classList.remove('active');
                    });
                    
                    const toolbar = document.getElementById(toolbarId);
                    if (toolbar) {
                        toolbar.classList.add('active');
                    }
                }
            }
        });
    }
    
    // Función auxiliar para determinar qué toolbar corresponde a cada campo
    function getToolbarForField(fieldId) {
        switch(fieldId) {
            case 'modalQuestion':
                return 'questionMathToolbar';
            case 'modalAnswer':
            case 'optionA':
            case 'optionB':
            case 'optionC':
            case 'optionD':
                return 'answerMathToolbar';
            case 'modalSolution':
                return 'solutionMathToolbar';
            default:
                return null;
        }
    }
    
    // Atajos de teclado mejorados
    document.addEventListener('keydown', function(e) {
        // Solo funciona si el modal está abierto
        const modal = document.getElementById('questionModal');
        if (!modal || !modal.classList.contains('active')) return;
        
        // Obtener el campo activo
        const activeElement = document.activeElement;
        let targetField = activeElement;
        
        // Si no hay campo enfocado, determinar cuál debería ser
        if (!targetField || !(
            targetField.id === 'modalQuestion' || 
            targetField.id === 'modalAnswer' ||
            targetField.id === 'modalSolution' ||
            targetField.id === 'optionA' ||
            targetField.id === 'optionB' ||
            targetField.id === 'optionC' ||
            targetField.id === 'optionD'
        )) {
            return; // No hacer nada si no hay campo válido
        }
        
        // Ctrl+Shift+F para fracción
        if (e.ctrlKey && e.shiftKey && e.key === 'F') {
            e.preventDefault();
            insertAtCursor(targetField, '\\frac{ }{ }');
        }
        // Ctrl+Shift+S para raíz
        if (e.ctrlKey && e.shiftKey && e.key === 'S') {
            e.preventDefault();
            insertAtCursor(targetField, '\\sqrt{ }');
        }
        // Ctrl+Shift+I para integral
        if (e.ctrlKey && e.shiftKey && e.key === 'I') {
            e.preventDefault();
            insertAtCursor(targetField, '\\int_{ }^{ }');
        }
        // Ctrl+Shift+E para exponente
        if (e.ctrlKey && e.shiftKey && e.key === 'E') {
            e.preventDefault();
            insertAtCursor(targetField, '^{ }');
        }
        // Ctrl+Shift+P para pi
        if (e.ctrlKey && e.shiftKey && e.key === 'P') {
            e.preventDefault();
            insertAtCursor(targetField, '\\pi');
        }
    });
}

function insertAtCursor(textarea, text) {
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    
    let modifiedText = text;
    
    // Si hay texto seleccionado, reemplazar { } con el texto seleccionado
    if (text.includes('{ }') && start !== end) {
        const selected = value.substring(start, end);
        modifiedText = text.replace('{ }', '{' + selected + '}');
    } else if (text.includes('{ }')) {
        // Si no hay texto seleccionado, solo poner el cursor dentro de los corchetes
        modifiedText = text.replace('{ }', '{}');
    }
    
    // Insertar texto
    textarea.value = value.substring(0, start) + modifiedText + value.substring(end);
    
    // Posicionar cursor dentro de los corchetes vacíos
    let newCursorPos;
    if (modifiedText.includes('{}')) {
        const bracePos = modifiedText.indexOf('{}');
        newCursorPos = start + bracePos + 1;
    } else if (modifiedText.includes('(') && modifiedText.includes(')') && !modifiedText.includes('(' + ')')) {
        const parenPos = modifiedText.indexOf('(');
        newCursorPos = start + parenPos + 1;
    } else if (modifiedText.includes('[') && modifiedText.includes(']') && !modifiedText.includes('[' + ']')) {
        const bracketPos = modifiedText.indexOf('[');
        newCursorPos = start + bracketPos + 1;
    } else if (modifiedText.includes('\\frac{}{}')) {
        // Caso especial para fracciones: poner cursor en el numerador
        const fracPos = modifiedText.indexOf('\\frac{}{}');
        newCursorPos = start + fracPos + 6; // Después de \frac{
    } else if (modifiedText.includes('\\sqrt{}')) {
        // Caso especial para raíz: poner cursor dentro de la raíz
        const sqrtPos = modifiedText.indexOf('\\sqrt{}');
        newCursorPos = start + sqrtPos + 6; // Después de \sqrt{
    } else {
        newCursorPos = start + modifiedText.length;
    }
    
    textarea.selectionStart = textarea.selectionEnd = newCursorPos;
    textarea.focus();
    
    // Actualizar MathJax para vista previa
    if (window.MathJax) {
        setTimeout(() => {
            MathJax.typesetPromise()
                .catch(err => console.log('MathJax error:', err));
        }, 100);
    }
}


function openStudyModal(question) {
  document.getElementById("modalQuestionSubject").textContent = question.subject;
  document.getElementById("modalQuestionTopic").textContent = question.topic;
  document.getElementById("modalQuestionUniversity").textContent = question.university;

  document.getElementById("modalQuestionText").innerHTML = question.question;

  document.getElementById("modalOptionsContainer").innerHTML = renderOptions(question);
  
  document.getElementById("modalAnswerText").innerHTML = question.answer || "";
  document.getElementById("modalSolutionText").innerHTML = question.solution || "";
  document.getElementById("modalAnswerSection").style.display = "none";

  document.getElementById("studyQuestionModal").style.display = "flex";

  MathJax.typeset();
}
function showModalAnswer() {
  document.getElementById("modalAnswerSection").style.display = "block";
  MathJax.typeset();
}

function closeStudyModal() {
  document.getElementById("studyQuestionModal").style.display = "none";
}
