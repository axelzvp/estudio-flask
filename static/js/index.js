        let allQuestions = [];

        let allSubjects = [];
        let allSimulators = [];
        let currentMode = 'study'; // 'study', 'exam' o 'simulator'
        

        // Variables para modo estudio

        let studySelectedSubject = 'todos';
        let studySelectedTopic = 'todos';
        let studyQuestionPool = [];
        let lastStudyQuestionId = null;
        

        // Variables para modo examen

        let examConfig = {

            questionCount: 10,

            timeLimit: 30, // minutos, 0 = sin lÃ­mite

            subjects: []
        };

        let selectedSimulator = null;
        

        let examState = {

            active: false,

            questions: [],

            currentQuestionIndex: 0,

            answers: [],

            startTime: null,

            timer: null,

            timeLeft: 0,

            submitted: false

        };

        

        // Inicializar aplicaciÃ³n

        document.addEventListener('DOMContentLoaded', async function() {

            await loadAllData();

            initApp();

        });

        

        async function loadAllData() {
            try {
                const response = await fetch('/api/questions');
                const data = await response.json();
                

                if (data.success) {

                    allQuestions = data.questions;
                    allSubjects = [...new Set(
                        allQuestions
                            .map(q => q.subject)
                            .filter(s => s && s.toLowerCase() !== 'simulador')
                    )];
                    updateExamSubjectSelect();
                    loadStudySubjects();
                    await loadSimulators();
                } else {

                    showNotification('Error al cargar las preguntas', 'error');

                }

            } catch (error) {

                console.error('Error cargando preguntas:', error);

                showNotification('Error de conexion con el servidor', 'error');

            }
        }

        async function loadSimulators() {
            try {
                const response = await fetch('/api/simulators');
                const data = await response.json();
                
                if (data.success && data.simulators.length > 0) {
                    allSimulators = data.simulators;
                } else {
                    allSimulators = [];
                }
            } catch (error) {
                console.error('Error cargando simuladores:', error);
                allSimulators = [];
            }
            
            renderSimulators();
        }
        

        function initApp() {

            // Selector de modo

            document.getElementById('studyModeBtn').addEventListener('click', () => switchMode('study'));

            document.getElementById('examModeBtn').addEventListener('click', () => switchMode('exam'));
            document.getElementById('simulatorModeBtn').addEventListener('click', () => switchMode('simulator'));
            

            // ConfiguraciÃ³n de examen

            document.getElementById('examQuestionCount').addEventListener('change', updateExamConfig);
            document.getElementById('examTimeLimit').addEventListener('change', updateExamConfig);
            document.getElementById('selectAllSubjectsBtn').addEventListener('click', selectAllExamSubjects);
            document.getElementById('clearSubjectsBtn').addEventListener('click', clearExamSubjects);
            document.getElementById('startExamBtn').addEventListener('click', startExam);
            

            // NavegaciÃ³n del examen

            document.getElementById('prevQuestionBtn').addEventListener('click', prevExamQuestion);

            document.getElementById('nextQuestionBtn').addEventListener('click', nextExamQuestion);

            document.getElementById('finishExamBtn').addEventListener('click', finishExam);

            

            // Modo estudio
            document.getElementById('getQuestionBtn').addEventListener('click', getRandomQuestion);

            // Simuladores
            document.getElementById('startSimulatorBtn').addEventListener('click', startSimulatorExam);
            const viewSimulatorResultsBtn = document.getElementById('viewSimulatorResultsBtn');
            if (viewSimulatorResultsBtn) {
                viewSimulatorResultsBtn.addEventListener('click', viewSimulatorResults);
            }

            // Usuario / menú
            setupUserMenu();
            loadCurrentUser();
        }
        

        function switchMode(mode) {
            currentMode = mode;
            
            // Actualizar botones de modo
            document.getElementById('studyModeBtn').classList.toggle('active', mode === 'study');
            document.getElementById('examModeBtn').classList.toggle('active', mode === 'exam');
            document.getElementById('simulatorModeBtn').classList.toggle('active', mode === 'simulator');
            
            // Mostrar/ocultar secciones
            document.getElementById('examConfigSection').classList.toggle('active', mode === 'exam');
            document.getElementById('studySelectorSection').style.display = mode === 'study' ? 'block' : 'none';
            document.getElementById('simulatorSection').style.display = mode === 'simulator' ? 'block' : 'none';
            
            if (mode === 'study') {
                loadStudySubjects();
            } else if (mode === 'simulator') {
                renderSimulators();
            }
            updateSimulatorResultsButtonVisibility();
        }

        function updateSimulatorResultsButtonVisibility() {
            const btn = document.getElementById('viewSimulatorResultsBtn');
            if (!btn) return;
            const hasAnyAttempt = Array.isArray(allSimulators) && allSimulators.some(sim => sim && sim.last_score);
            const shouldShow = hasAnyAttempt;
            btn.style.display = shouldShow ? 'inline-flex' : 'none';
        }

        function setupUserMenu() {
            const btn = document.getElementById('userMenuBtn');
            const dropdown = document.getElementById('userMenuDropdown');
            if (!btn || !dropdown) return;
            
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                dropdown.classList.toggle('active');
            });

            dropdown.addEventListener('click', function(e) {
                e.stopPropagation();
            });
            
            document.addEventListener('click', function() {
                dropdown.classList.remove('active');
            });
            
            const logoutBtn = document.getElementById('logoutBtn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', logoutUser);
            }
        }

        async function loadCurrentUser() {
            try {
                const response = await fetch('/api/current-user');
                const data = await response.json();
                if (data.success && data.user) {
                    document.getElementById('userMenuName').textContent =
                        `${data.user.nombre} ${data.user.apellido}`;
                }
            } catch (error) {
                console.error('Error cargando usuario:', error);
            }
        }

        async function logoutUser() {
            try {
                await fetch('/api/logout', { method: 'POST' });
            } catch (error) {
                console.error('Error cerrando sesión:', error);
            } finally {
                window.location.href = '/login';
            }
        }
        

        // ========== FUNCIONES PARA MODO ESTUDIO ==========

        function loadStudySubjects() {
            const container = document.getElementById('subjectButtons');
            if (!container) return;
            
            container.innerHTML = '';
            const studyQuestions = allQuestions.filter(q => q.subject && q.subject.toLowerCase() !== 'simulador');
            studyQuestionPool = [];
            lastStudyQuestionId = null;
            
            // Agregar "Todas las materias"
            const allBtn = document.createElement('div');
            allBtn.className = 'subject-card active';
            allBtn.innerHTML = `
                <div class="subject-icon">
                    <i class="fas fa-layer-group"></i>
                </div>
                <div class="subject-name">Todas</div>
                <div class="subject-count">${studyQuestions.length}</div>
            `;
            allBtn.dataset.subject = 'todos';

            allBtn.addEventListener('click', function() {

                document.querySelectorAll('.subject-card').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                studySelectedSubject = 'todos';
                studySelectedTopic = 'todos';
                studyQuestionPool = [];
                lastStudyQuestionId = null;
                document.getElementById('topicSelectorContainer').style.display = 'none';
            });
            container.appendChild(allBtn);

            

            // Agregar cada materia

            const iconMap = {

                'Matematicas': 'fas fa-calculator',

                'Física': 'fas fa-atom',

                'Quimica': 'fas fa-flask',

                'Biologia': 'fas fa-dna',

                'Historia': 'fas fa-landmark',

                'Geografia': 'fas fa-globe',

                'Literatura': 'fas fa-book-open',

                'Ingles': 'fas fa-language',

                'Programacion': 'fas fa-code',

                'Economia': 'fas fa-chart-line',

                'Filosofia': 'fas fa-brain',

                'Arte': 'fas fa-palette'

            };

            

            allSubjects.forEach(subject => {

                const count = allQuestions.filter(q => q.subject === subject).length;

                if (count === 0) return;

                

                const btn = document.createElement('div');

                btn.className = 'subject-card';

                btn.innerHTML = `

                    <div class="subject-icon">

                        <i class="${iconMap[subject] || 'fas fa-book'}"></i>

                    </div>

                    <div class="subject-name">${subject}</div>

                    <div class="subject-count">${count}</div>

                `;

                btn.dataset.subject = subject;

                btn.addEventListener('click', function() {
                    document.querySelectorAll('.subject-card').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    studySelectedSubject = subject;
                    studySelectedTopic = 'todos';
                    studyQuestionPool = [];
                    lastStudyQuestionId = null;
                    loadStudyTopics();
                });
                container.appendChild(btn);

            });

        }

        

        async function loadStudyTopics() {
            const container = document.getElementById('studyTopicButtons');
            const topicSelector = document.getElementById('topicSelectorContainer');
            

            if (!studySelectedSubject || studySelectedSubject === 'todos') {

                topicSelector.style.display = 'none';

                return;

            }

            

            try {
                container.innerHTML = '';
                topicSelector.style.display = 'block';
                studyQuestionPool = [];
                lastStudyQuestionId = null;
                

                // Filtrar temas de la materia seleccionada

                const topics = [...new Set(

                    allQuestions

                        .filter(q => q.subject === studySelectedSubject)

                        .map(q => q.topic)

                )].sort();

                

                document.getElementById('currentSubjectName').textContent = studySelectedSubject;

                

                if (topics.length > 0) {

                    // Agregar "Todos los temas"

                    const allBtn = document.createElement('div');

                    allBtn.className = studySelectedTopic === 'todos' ? 'topic-chip active' : 'topic-chip';

                    allBtn.innerHTML = `

                        <i class="fas fa-layer-group"></i> Todos

                    `;

                    allBtn.dataset.topic = 'todos';

                    allBtn.addEventListener('click', function() {
                        document.querySelectorAll('.topic-chip').forEach(b => b.classList.remove('active'));
                        this.classList.add('active');
                        studySelectedTopic = 'todos';
                        studyQuestionPool = [];
                        lastStudyQuestionId = null;
                    });
                    container.appendChild(allBtn);

                    

                    // Agregar cada tema

                    topics.forEach(topic => {

                        const btn = document.createElement('div');

                        btn.className = studySelectedTopic === topic ? 'topic-chip active' : 'topic-chip';

                        btn.innerHTML = `

                            <i class="fas fa-folder"></i> ${topic}

                        `;

                        btn.dataset.topic = topic;

                        btn.addEventListener('click', function() {
                            document.querySelectorAll('.topic-chip').forEach(b => b.classList.remove('active'));
                            this.classList.add('active');
                            studySelectedTopic = topic;
                            studyQuestionPool = [];
                            lastStudyQuestionId = null;
                        });
                        container.appendChild(btn);

                    });

                }

            } catch (error) {

                console.error('Error cargando temas:', error);

                topicSelector.style.display = 'none';

            }
        }

        function formatCompactDateTime(value) {
            if (!value) return null;
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return null;
            const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
            const day = date.getDate();
            const month = months[date.getMonth()];
            let hour = date.getHours();
            const suffix = hour >= 12 ? 'pm' : 'am';
            hour = hour % 12 || 12;
            const minute = String(date.getMinutes()).padStart(2, '0');
            return `${day}/${month} ${hour}:${minute} ${suffix}`;
        }

        function formatSimulatorWindow(sim) {
            const from = sim && sim.enabled_from ? sim.enabled_from : null;
            const until = sim && sim.enabled_until ? sim.enabled_until : null;
            const format = (value) => formatCompactDateTime(value);
            const fromText = format(from);
            const untilText = format(until);

            if (fromText && untilText) return `Disponible: ${fromText} - ${untilText}`;
            if (fromText) return `Disponible desde: ${fromText}`;
            if (untilText) return `Disponible hasta: ${untilText}`;
            return 'Disponible sin horario';
        }

        function renderSimulators() {
            const list = document.getElementById('simulatorList');
            if (!list) return;
            
            list.innerHTML = '';
            
            if (!allSimulators || allSimulators.length === 0) {
                list.innerHTML = '<div class="empty-state">No hay simuladores disponibles</div>';
                selectedSimulator = null;
                return;
            }
            
            const sorted = [...allSimulators].sort((a, b) => a.name.localeCompare(b.name));
            const previousSelectedName = selectedSimulator && selectedSimulator.name ? selectedSimulator.name : '';
            selectedSimulator = null;

            sorted.forEach(sim => {
                const card = document.createElement('div');
                card.className = 'simulator-card';
                card.innerHTML = `
                    <div class="simulator-card-title">${sim.name}</div>
                    <div class="simulator-card-meta">
                        <span><i class="fas fa-list-ol"></i> ${sim.question_count || 0} preguntas</span>
                        <span><i class="fas fa-clock"></i> ${sim.time_limit || 0} min</span>
                        <span><i class="fas fa-star"></i> ${sim.last_score ? `${sim.last_score.correct}/${sim.last_score.total}` : 'Sin puntaje'}</span>
                    </div>
                    <div class="simulator-card-meta">
                        <span><i class="fas ${sim.is_open ? 'fa-toggle-on' : 'fa-toggle-off'}"></i> ${sim.is_open ? 'Habilitado' : 'Deshabilitado'}</span>
                    </div>
                    <div class="simulator-card-meta">
                        <span><i class="fas fa-calendar-alt"></i> ${formatSimulatorWindow(sim)}</span>
                    </div>
                `;
                card.addEventListener('click', function() {
                    document.querySelectorAll('.simulator-card').forEach(c => c.classList.remove('active'));
                    this.classList.add('active');
                    selectedSimulator = sim;
                    updateSimulatorResultsButtonVisibility();
                });
                list.appendChild(card);

                if (previousSelectedName && sim.name === previousSelectedName) {
                    card.classList.add('active');
                    selectedSimulator = sim;
                }
            });

            if (!selectedSimulator && sorted.length > 0) {
                selectedSimulator = sorted[0];
                const firstCard = list.querySelector('.simulator-card');
                if (firstCard) firstCard.classList.add('active');
            }
            updateSimulatorResultsButtonVisibility();
        }

        async function startSimulatorExam() {
            if (!selectedSimulator) {
                showNotification('Selecciona un simulador', 'warning');
                return;
            }
            
            try {
                const response = await fetch(`/api/simulators/${encodeURIComponent(selectedSimulator.name)}/questions`);
                const data = await response.json();
                
                if (!data.success || !data.questions || data.questions.length === 0) {
                    showNotification(data.error || 'No hay preguntas en este simulador', 'error');
                    return;
                }
                
                examState.questions = data.questions;
                examConfig.questionCount = data.questions.length;
                examConfig.timeLimit = data.time_limit || selectedSimulator.time_limit || 0;
                
                // Inicializar estado del examen
                examState.active = true;
                examState.currentQuestionIndex = 0;
                examState.answers = new Array(examConfig.questionCount).fill(null);
                examState.startTime = new Date();
                examState.submitted = false;
                
                // Configurar temporizador fijo
                if (examConfig.timeLimit > 0) {
                    examState.timeLeft = examConfig.timeLimit * 60;
                    startExamTimer();
                }
                
                // Mostrar interfaz de examen
                document.getElementById('examActiveModal').classList.add('active');
                showExamQuestion(0);
            } catch (error) {
                console.error('Error cargando simulador:', error);
                showNotification('Error cargando el simulador', 'error');
            }
        }
        

        async function getRandomQuestion() {
    const getBtn = document.getElementById('getQuestionBtn');
    const originalText = getBtn.innerHTML;
    getBtn.innerHTML = '<i class="fas fa-spinner loading"></i> Buscando...';
    getBtn.disabled = true;
    
    try {
        const candidates = allQuestions.filter(q => {
            if (q.subject && q.subject.toLowerCase() === 'simulador') return false;
            if (studySelectedSubject !== 'todos' && q.subject !== studySelectedSubject) return false;
            if (studySelectedTopic !== 'todos' && q.topic !== studySelectedTopic) return false;
            return true;
        });
        
        if (candidates.length === 0) {
            showNotification('No hay preguntas con estos filtros', 'warning');
            return;
        }
        
        if (studyQuestionPool.length === 0) {
            studyQuestionPool = candidates.slice();
            for (let i = studyQuestionPool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [studyQuestionPool[i], studyQuestionPool[j]] = [studyQuestionPool[j], studyQuestionPool[i]];
            }
        }
        
        let nextQuestion = studyQuestionPool.pop();
        if (nextQuestion && nextQuestion._id === lastStudyQuestionId && studyQuestionPool.length > 0) {
            studyQuestionPool.unshift(nextQuestion);
            nextQuestion = studyQuestionPool.pop();
        }
        
        if (!nextQuestion) {
            showNotification('No hay preguntas disponibles', 'warning');
            return;
        }
        
        lastStudyQuestionId = nextQuestion._id;
        displayStudyQuestion(nextQuestion);
    } catch (error) {
        console.error('Error obteniendo pregunta:', error);
        showNotification('Error de conexión', 'error');
    } finally {
        getBtn.innerHTML = originalText;
        getBtn.disabled = false;
    }
}

function loadImagesInQuestion() {

    const images = document.querySelectorAll('img[src]');

    

    images.forEach(img => {

        // Remover estilos inline conflictivos

        img.style.maxWidth = '';

        img.style.maxHeight = '';

        img.style.height = '';

        img.style.width = '';

        

        // Aplicar solo las clases CSS

        img.classList.add('img-loaded');

        

        // Verificar si la imagen ya estÃ¡ cargada

        if (img.complete) {

            handleImageLoad(img);

        } else {

            img.onload = () => handleImageLoad(img);

            img.onerror = () => handleImageError(img);

        }

    });

}



function handleImageLoad(img) {

    img.style.opacity = '1';

    img.style.transition = 'opacity 0.3s ease';

    console.log('â Imagen cargada:', img.src);

}



function handleImageError(img) {

    console.error('â Error cargando imagen:', img.src);

    

    // Crear contenedor de error

    const container = document.createElement('div');

    container.className = 'img-error';

    container.innerHTML = `

        <i class="fas fa-exclamation-triangle"></i>

        <div>No se pudo cargar la imagen</div>

        <small>${img.src.split('/').pop()}</small>

    `;

    

    // Reemplazar la imagen con el mensaje de error

    img.parentNode.replaceChild(container, img);

}





function closeExpandedImage() {

    const modal = document.querySelector('.image-expand-modal');

    if (modal) {

        modal.remove();

        document.body.style.overflow = '';

    }

    document.removeEventListener('keydown', handleEscKey);

}









// FunciÃ³n para expandir imagen

function expandQuestionImage(src) {

    const modal = document.createElement('div');

    modal.className = 'image-expand-modal';

    modal.innerHTML = `

        <div class="image-expand-overlay" onclick="closeExpandedImage()">

            <button class="close-expanded-btn">&times;</button>

            <img src="${src}" alt="Imagen ampliada" class="expanded-image"

                 onerror="this.onerror=null; this.style.display='none';">

        </div>

    `;

    document.body.appendChild(modal);

    

    // Prevenir scroll del body

    document.body.style.overflow = 'hidden';

    

    // Agregar evento de tecla Escape

    document.addEventListener('keydown', handleEscKey);

    

    function handleEscKey(e) {

        if (e.key === 'Escape') {

            closeExpandedImage();

        }

    }

}





async function checkImageExists(url) {

    return new Promise((resolve) => {

        const img = new Image();

        img.onload = () => resolve(true);

        img.onerror = () => resolve(false);

        img.src = url;

    });

}



function displayStudyQuestion(question) {

    // Actualizar badges

    document.getElementById('subjectText').textContent = question.subject;

    document.getElementById('topicText').textContent = question.topic;

    document.getElementById('universityText').textContent = question.university || 'General';

    const questionTextEl = document.getElementById('modalQuestionText');
    const optionsContainer = document.getElementById('modalOptionsContainer');
    const answerTextEl = document.getElementById('modalAnswerText');
    const solutionTextEl = document.getElementById('modalSolutionText');

    [questionTextEl, optionsContainer, answerTextEl, solutionTextEl].forEach(el => {
        if (el) el.style.visibility = 'hidden';
    });
    if (optionsContainer) {
        optionsContainer.style.display = 'none';
    }

    

    // Actualizar pregunta

    const cleanedText = cleanQuestionText(question.question);
    let questionHTML = `<span class="question-text-content">${cleanedText}</span>`;

    

    // AÃ±adir imagen si existe - CORREGIDO

    if (question.image && question.image.trim() !== '') {

           const imageUrl = `/static/img/${question.image}`;

           questionHTML += `

               <div class="question-image-container">

                   <img src="${imageUrl}" 

                        alt="Imagen del ejercicio" 

                        class="question-image"

                        onclick="expandQuestionImage('${imageUrl}')">

               </div>

           `;

       }

    

    questionTextEl.innerHTML = questionHTML;
    const imagesReady = (() => {
        const imgs = Array.from(questionTextEl.querySelectorAll('img'));
        if (imgs.length === 0) return Promise.resolve();
        return Promise.race([
            Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(res => {
                img.addEventListener('load', res, { once: true });
                img.addEventListener('error', res, { once: true });
            }))),
            new Promise(res => setTimeout(res, 1500))
        ]);
    })();

    

    // Resto del cÃ³digo sigue igual...

    // Actualizar opciones

    optionsContainer.innerHTML = '';

    

    if (question.has_options && question.options && question.options.length > 0) {

        let optionsHTML = '';

        

        question.options.forEach((option, index) => {

            const letter = String.fromCharCode(65 + index);

            optionsHTML += `

                <div class="option-card" onclick="checkAnswer(${index}, '${question._id}')" data-index="${index}">

                    <div class="option-letter">${letter}</div>

                    <div class="option-text">${option}</div>

                </div>

            `;

        });

        

        optionsContainer.innerHTML = optionsHTML;

    } else {

        optionsContainer.innerHTML = '<p style="color: var(--gray); font-style: italic; text-align: center;">Esta es una pregunta de respuesta abierta</p>';

    }

    

    // Actualizar respuesta y soluciÃ³n

    answerTextEl.innerHTML = question.answer || question.correct_answer || '';

    

    const solutionContainer = document.getElementById('solutionContainer');

    if (question.solution && question.solution.trim() !== '') {

        solutionTextEl.innerHTML = question.solution;

        solutionContainer.style.display = 'block';

    } else {

        solutionContainer.style.display = 'none';

    }

    

    // Ocultar respuesta inicialmente

    document.getElementById('modalAnswerSection').style.display = 'none';

    

    // Mostrar modal

    document.getElementById('studyQuestionModal').classList.add('active');

    

    if (window.MathJax) {
        setTimeout(() => {
            Promise.all([
                MathJax.typesetPromise().catch(err => console.log('MathJax error:', err)),
                imagesReady
            ]).finally(() => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        [questionTextEl, optionsContainer, answerTextEl, solutionTextEl].forEach(el => {
                            if (el) el.style.visibility = '';
                        });
                        if (optionsContainer) {
                            optionsContainer.style.display = '';
                        }
                    });
                });
            });
        }, 100);
    } else {
        imagesReady.finally(() => {
            [questionTextEl, optionsContainer, answerTextEl, solutionTextEl].forEach(el => {
                if (el) el.style.visibility = '';
            });
            if (optionsContainer) {
                optionsContainer.style.display = '';
            }
        });
    }

}

        

function checkAnswer(selectedIndex, questionId) {

    const question = allQuestions.find(q => q._id === questionId);

    if (!question || !question.has_options) return;

    

    const optionCards = document.querySelectorAll('.option-card');

    const isCorrect = selectedIndex === question.correct_option;

    

    // Deshabilitar todas las opciones

    optionCards.forEach(card => {

        card.style.cursor = 'not-allowed';

        card.onclick = null;

        

        // Remover cualquier indicador previo

        card.classList.remove('correct', 'incorrect', 'correct-answer');

    });

    

    // Marcar respuesta seleccionada

    const selectedCard = optionCards[selectedIndex];

    if (selectedCard) {

        if (isCorrect) {

            selectedCard.classList.add('correct');

            showNotification('â Correcto', 'success');

        } else {

            selectedCard.classList.add('incorrect');

            showNotification('â Incorrecto', 'error');

            

            // Mostrar claramente cuÃ¡l es la respuesta correcta

            if (question.correct_option >= 0) {

                const correctCard = optionCards[question.correct_option];

                if (correctCard) {

                    // Agrega una clase especial para la respuesta correcta

                    correctCard.classList.add('correct-answer');

                    

                    // TambiÃ©n puedes agregar un icono de check

                    const correctIcon = document.createElement('i');

                    correctIcon.className = 'fas fa-check correct-icon';

                    correctIcon.style.marginLeft = '10px';

                    correctIcon.style.color = '#28a745';

                    

                    // Busca el contenedor de la letra de la opciÃ³n

                    const optionLetter = correctCard.querySelector('.option-letter');

                    if (optionLetter) {

                        optionLetter.appendChild(correctIcon);

                    }

                }

            }

        }

    }

    

    // Asegurar que las imÃ¡genes en las opciones se vean bien

    forceImageLoading();

    

    // Mostrar respuesta y soluciÃ³n si existe

    if (question.solution && question.solution.trim() !== '') {

        setTimeout(() => {

            showModalAnswer();

        }, 500);

    }

    

    // Actualizar MathJax

    if (window.MathJax) {

        setTimeout(() => {

            MathJax.typesetPromise()

                .catch(err => console.log('MathJax error:', err));

        }, 150);

    }

}





        

        function closeStudyModal() {

            document.getElementById('studyQuestionModal').classList.remove('active');

        }

        

        function showModalAnswer() {

            document.getElementById('modalAnswerSection').style.display = 'block';

            if (window.MathJax) {

                setTimeout(() => {

                    MathJax.typesetPromise()

                        .catch(err => console.log('MathJax error:', err));

                }, 50);

            }

        }

        

        // ========== FUNCIONES PARA MODO EXAMEN ==========
        function updateExamSubjectSelect() {
            const container = document.getElementById('examSubjectList');
            container.innerHTML = '';
            
            allSubjects.forEach(subject => {
                const id = `exam-subject-${subject.replace(/\s+/g, '-').toLowerCase()}`;
                const item = document.createElement('label');
                item.className = 'exam-subject-item';
                item.innerHTML = `
                    <input type="checkbox" class="exam-subject-checkbox" value="${subject}" checked>
                    <span>${subject}</span>
                `;
                item.querySelector('input').addEventListener('change', updateExamConfig);
                container.appendChild(item);
            });
            
            updateExamConfig();
        }
        

        function updateExamConfig() {
            const checked = Array.from(document.querySelectorAll('.exam-subject-checkbox:checked'))
                .map(cb => cb.value);
            examConfig = {
                questionCount: parseInt(document.getElementById('examQuestionCount').value),
                timeLimit: parseInt(document.getElementById('examTimeLimit').value),
                subjects: checked
            };
        }

        function selectAllExamSubjects() {
            document.querySelectorAll('.exam-subject-checkbox').forEach(cb => {
                cb.checked = true;
            });
            updateExamConfig();
        }

        function clearExamSubjects() {
            document.querySelectorAll('.exam-subject-checkbox').forEach(cb => {
                cb.checked = false;
            });
            updateExamConfig();
        }
        

        async function startExam() {
            updateExamConfig();

            // Filtrar preguntas segÃºn configuraciÃ³n

            let filteredQuestions = allQuestions.filter(q => {
                if (q.subject && q.subject.toLowerCase() === 'simulador') return false;
                if (examConfig.subjects && examConfig.subjects.length > 0 && !examConfig.subjects.includes(q.subject)) return false;
                return true;
            });
            

            if (filteredQuestions.length === 0) {

                showNotification('No hay preguntas disponibles con los filtros seleccionados', 'error');

                return;

            }

            

            if (filteredQuestions.length < examConfig.questionCount) {

                showNotification(`Solo hay ${filteredQuestions.length} preguntas disponibles. Se usaran todas.`, 'warning');

                examConfig.questionCount = filteredQuestions.length;

            }

            

            // Seleccionar preguntas aleatorias de forma equilibrada por materia

            const allAvailable = allQuestions.filter(q => !(q.subject && q.subject.toLowerCase() === 'simulador'));
            const selectedSubjects = (examConfig.subjects && examConfig.subjects.length > 0)
                ? examConfig.subjects
                : [...new Set(allAvailable.map(q => q.subject))];

            const subjectPools = {};
            selectedSubjects.forEach(subject => {
                subjectPools[subject] = allAvailable.filter(q => q.subject === subject);
                // shuffle
                for (let i = subjectPools[subject].length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [subjectPools[subject][i], subjectPools[subject][j]] = [subjectPools[subject][j], subjectPools[subject][i]];
                }
            });

            examState.questions = [];
            const usedIds = new Set();
            const subjectCount = selectedSubjects.length;
            const base = Math.floor(examConfig.questionCount / subjectCount);
            let remaining = examConfig.questionCount;

            // Reparto base
            selectedSubjects.forEach(subject => {
                const pool = subjectPools[subject] || [];
                const take = Math.min(base, pool.length);
                for (let i = 0; i < take; i++) {
                    const q = pool.pop();
                    if (q && !usedIds.has(q._id)) {
                        examState.questions.push(q);
                        usedIds.add(q._id);
                        remaining--;
                    }
                }
            });

            // Reparto del resto priorizando materias con preguntas disponibles
            let round = 0;
            while (remaining > 0) {
                let picked = false;
                for (const subject of selectedSubjects) {
                    if (remaining === 0) break;
                    const pool = subjectPools[subject] || [];
                    if (pool.length > 0) {
                        const q = pool.pop();
                        if (q && !usedIds.has(q._id)) {
                            examState.questions.push(q);
                            usedIds.add(q._id);
                            remaining--;
                            picked = true;
                        }
                    }
                }
                if (!picked) break;
                round++;
                if (round > 1000) break;
            }

            // Si aún faltan, rellenar con cualquier materia disponible
            if (remaining > 0) {
                const leftovers = allAvailable.filter(q => !usedIds.has(q._id));
                // shuffle leftovers
                for (let i = leftovers.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [leftovers[i], leftovers[j]] = [leftovers[j], leftovers[i]];
                }
                for (let i = 0; i < leftovers.length && remaining > 0; i++) {
                    examState.questions.push(leftovers[i]);
                    remaining--;
                }
            }
            
            // Inicializar estado del examen
            examState.active = true;

            examState.currentQuestionIndex = 0;

            examState.answers = new Array(examConfig.questionCount).fill(null);

            examState.startTime = new Date();

            examState.submitted = false;

            

            // Configurar temporizador si hay lÃ­mite de tiempo

            if (examConfig.timeLimit > 0) {

                examState.timeLeft = examConfig.timeLimit * 60; // Convertir a segundos

                startExamTimer();

            }

            

            // Mostrar interfaz de examen

            document.getElementById('examActiveModal').classList.add('active');

            showExamQuestion(0);

        }

        

        function startExamTimer() {

            updateTimerDisplay();

            

            examState.timer = setInterval(() => {

                examState.timeLeft--;

                updateTimerDisplay();

                

                if (examState.timeLeft <= 0) {

                    clearInterval(examState.timer);

                    finishExam();

                    showNotification('Â¡Tiempo agotado!', 'error');

                }

                

                // Cambiar color del temporizador

                const timerElement = document.getElementById('examTimer');

                const minutesLeft = Math.floor(examState.timeLeft / 60);

                

                timerElement.classList.remove('warning', 'critical');

                if (minutesLeft < 5 && examState.timeLeft > 0) {

                    timerElement.classList.add('critical');

                } else if (minutesLeft < 10 && examState.timeLeft > 0) {

                    timerElement.classList.add('warning');

                }

            }, 1000);

        }

        

        function updateTimerDisplay() {

            const timerElement = document.getElementById('timerDisplay');

            if (examConfig.timeLimit === 0) {

                timerElement.textContent = 'Sin limite';

                return;

            }

            

            const minutes = Math.floor(examState.timeLeft / 60);

            const seconds = examState.timeLeft % 60;

            timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        }



        

// Limpia texto de preguntas respetando enters sin espacios vacíos extra
function cleanQuestionText(text) {
    if (!text) return '';
    const lines = text.split('\n');
    const cleanedLines = lines
        .map(line => line.trim())
        .filter((line, idx, arr) => {
            if (line !== '') return true;
            return idx > 0 && arr[idx - 1] !== '' && idx < arr.length - 1 && arr[idx + 1] !== '';
        });
    return cleanedLines.join('\n');
}

function showExamQuestion(index) {

    if (index < 0 || index >= examState.questions.length) return;

    

    examState.currentQuestionIndex = index;

    const question = examState.questions[index];

    

    // Actualizar progreso

    const progressPercent = ((index + 1) / examState.questions.length) * 100;

    document.getElementById('examProgressFill').style.width = `${progressPercent}%`;

    document.getElementById('examProgressText').textContent = `Pregunta ${index + 1}/${examState.questions.length}`;

    

    // Actualizar nÃºmero de pregunta

    document.getElementById('prevQuestionBtn').disabled = index === 0;

    document.getElementById('nextQuestionBtn').disabled = index === examState.questions.length - 1;

    

    // Crear HTML de pregunta con imagen - CORREGIDO

    const cleanedText = cleanQuestionText(question.question);
    let questionHTML = `<span class="exam-question-text">${cleanedText}</span>`;

    

    // AÃ±adir imagen si existe - con manejo de errores

    if (question.image && question.image.trim() !== '') {

        const imageUrl = `/static/img/${question.image}`;

        questionHTML += `

            <div class="question-image-container">

                <img src="${imageUrl}" 

                     alt="Imagen del ejercicio" 

                     class="question-image"

                     onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='block';"

                     onclick="expandQuestionImage('${imageUrl}')">

                <div class="image-error" style="display: none;">

                    <i class="fas fa-exclamation-triangle"></i>

                    <span>No se pudo cargar la imagen</span>

                </div>

                <div class="image-caption">
                    <i class="fas fa-expand-alt"></i> Haz clic para ampliar
                </div>

            </div>

        `;

    }

    

    // Mostrar pregunta

    const container = document.getElementById('examQuestionContainer');

    container.innerHTML = `

        <div class="exam-question-header">

            <div class="question-number">Pregunta #${index + 1}</div>

            <div class="question-badges">

                <span class="badge badge-subject">${question.subject}</span>

                <span class="badge badge-topic">${question.topic}</span>

            </div>

        </div>

        

        <div class="exam-question-content">

            ${questionHTML}

        </div>

        

        <div class="exam-options-container" id="examOptionsContainer">

            ${generateExamOptionsHTML(question, index)}

        </div>

    `;

    

    // Marcar respuesta seleccionada si existe

    const selectedAnswer = examState.answers[index];

    if (selectedAnswer !== null) {

        const options = container.querySelectorAll('.exam-option');

        if (options[selectedAnswer]) {

            options[selectedAnswer].classList.add('selected');

        }

    }

    

    // Renderizar MathJax

    if (window.MathJax) {

        setTimeout(() => {

            MathJax.typesetPromise()

                .catch(err => console.log('MathJax error:', err));

        }, 100);

    }

    

    // Asegurar que las imÃ¡genes se muestren

    setTimeout(() => {

        forceImageLoading();

        

        // Agregar eventos a las imÃ¡genes en el examen

        const examImages = container.querySelectorAll('.question-image');

        examImages.forEach(img => {

            img.style.maxHeight = '200px'; // MÃ¡s pequeÃ±o para examen

            img.style.cursor = 'pointer';

        });

    }, 50);

}

        

        function generateExamOptionsHTML(question, questionIndex) {

            if (!question.has_options || !question.options || question.options.length === 0) {

                return `

                    <div class="open-answer-container">

                        <label for="openAnswer${questionIndex}">Tu respuesta:</label>

                        <textarea id="openAnswer${questionIndex}" class="form-control" rows="4" 

                                  placeholder="Escribe tu respuesta aqui­...">${examState.answers[questionIndex] || ''}</textarea>

                    </div>

                `;

            }

            

            let optionsHTML = '';

            question.options.forEach((option, index) => {

                const letter = String.fromCharCode(65 + index);
                const cleanedOption = cleanQuestionText(option);

                optionsHTML += `

                    <div class="exam-option" data-index="${index}" onclick="selectExamOption(${index})">

                        <div class="exam-option-letter">${letter}</div>

                        <div class="exam-option-content">${cleanedOption}</div>

                    </div>

                `;

            });

            

            return optionsHTML;

        }

        

        function selectExamOption(index) {

            const questionIndex = examState.currentQuestionIndex;

            examState.answers[questionIndex] = index;

            

            // Actualizar visualizaciÃ³n

            const options = document.querySelectorAll('#examOptionsContainer .exam-option');

            options.forEach(opt => opt.classList.remove('selected'));

            if (options[index]) {

                options[index].classList.add('selected');

            }

            

            // Habilitar botÃ³n de responder

        }

        

        function prevExamQuestion() {

            if (examState.currentQuestionIndex > 0) {

                showExamQuestion(examState.currentQuestionIndex - 1);

            }

        }

        

        function nextExamQuestion() {

            if (examState.currentQuestionIndex < examState.questions.length - 1) {

                showExamQuestion(examState.currentQuestionIndex + 1);

            }

        }

        

        function submitExamAnswer() {

            const questionIndex = examState.currentQuestionIndex;

            const question = examState.questions[questionIndex];

            

            // Para preguntas abiertas, obtener el valor del textarea

            if (!question.has_options) {

                const textarea = document.getElementById(`openAnswer${questionIndex}`);

                if (textarea) {

                    examState.answers[questionIndex] = textarea.value.trim();

                }

            }

            

            // Marcar como respondida

            if (examState.answers[questionIndex] !== null) {

                showNotification('Respuesta guardada', 'success');

                

                // Avanzar a la siguiente pregunta si hay

                if (questionIndex < examState.questions.length - 1) {

                    nextExamQuestion();

                } else {

                    showNotification('Has respondido todas las preguntas', 'info');

                }

            } else {

                showNotification('Selecciona una respuesta primero', 'warning');

            }

        }

        

        function finishExam() {

            if (examState.timer) {

                clearInterval(examState.timer);

            }

            

            // Calcular resultados

            const results = calculateExamResults();

            showExamResults(results);

            if (currentMode === 'simulator' && selectedSimulator) {
                fetch(`/api/simulators/${encodeURIComponent(selectedSimulator.name)}/score`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        correct: results.correct,
                        total: results.total,
                        section_stats: results.sectionStats || {}
                    })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        selectedSimulator.last_score = { correct: results.correct, total: results.total };
                        renderSimulators();
                        updateSimulatorResultsButtonVisibility();
                    }
                })
                .catch(err => console.log('Error guardando puntaje:', err));
            }

            

            // Cerrar modal de examen activo

            document.getElementById('examActiveModal').classList.remove('active');

            examState.active = false;

        }

        

        function calculateExamResults() {

            let correct = 0;

            const total = examState.questions.length;

            const review = [];
            const sectionStats = {};

            

            examState.questions.forEach((question, index) => {

                const userAnswer = examState.answers[index];

                let isCorrect = false;

                let correctAnswer = '';

                

                if (question.has_options) {

                    isCorrect = userAnswer === question.correct_option;

                    correctAnswer = question.correct_option !== undefined && question.correct_option !== -1 

                        ? `${String.fromCharCode(65 + question.correct_option)}. ${question.options[question.correct_option]}`

                        : 'N/A';

                } else {

                    // Para preguntas abiertas, asumir correctas si hay respuesta (en una app real, necesitarÃ­as correcciÃ³n manual)

                    isCorrect = userAnswer !== null && userAnswer.trim() !== '';

                    correctAnswer = question.correct_answer || question.answer || '';

                }

                

                if (isCorrect) correct++;

                const sectionName = (question.simulator_subject || 'General').trim() || 'General';
                if (!sectionStats[sectionName]) {
                    sectionStats[sectionName] = { correct: 0, total: 0 };
                }
                sectionStats[sectionName].total += 1;
                if (isCorrect) {
                    sectionStats[sectionName].correct += 1;
                }

                

                review.push({

                    question: question.question,

                    userAnswer: question.has_options 

                        ? (userAnswer !== null ? `${String.fromCharCode(65 + userAnswer)}. ${question.options[userAnswer] || ''}` : 'Sin responder')

                        : userAnswer || 'Sin responder',

                    correctAnswer: correctAnswer,

                    isCorrect: isCorrect,

                    solution: question.solution || ''

                });

            });

            

            const score = total > 0 ? Math.round((correct / total) * 100) : 0;

            const grade = getGrade(score);

            

            // Calcular tiempo utilizado

            const endTime = new Date();

            const timeUsed = examState.startTime ? Math.floor((endTime - examState.startTime) / 1000) : 0;

            const timeUsedFormatted = formatTime(timeUsed);

            

            return {

                score,

                grade,

                correct,

                total,

                timeUsed: timeUsedFormatted,
                review,
                sectionStats

            };

        }

        

        function getGrade(score) {

            if (score >= 90) return 'Excelente (A)';

            if (score >= 80) return 'Muy Bueno (B)';

            if (score >= 70) return 'Bueno (C)';

            if (score >= 60) return 'Suficiente (D)';

            return 'Insuficiente (F)';

        }

        

        function formatTime(seconds) {

            const minutes = Math.floor(seconds / 60);

            const secs = seconds % 60;

            return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        }

        

        function showExamResults(results) {

            document.getElementById('examTimeUsed').textContent = `Tiempo utilizado: ${results.timeUsed}`;

            

            // Mostrar estadÃ­sticas

            const statsContainer = document.getElementById('examStats');

            statsContainer.innerHTML = '';

            const correctBox = document.getElementById('examCorrectBox');
            if (correctBox) {
                correctBox.textContent = `${results.correct}/${results.total}`;
            }

            

            // Mostrar revisiÃ³n de preguntas

            const reviewContainer = document.getElementById('examReviewQuestions');

            reviewContainer.innerHTML = '';

            

            results.review.forEach((item, index) => {

                const questionDiv = document.createElement('div');

                questionDiv.className = `result-question-item ${item.isCorrect ? 'correct' : 'incorrect'}`;

                questionDiv.innerHTML = `

                    <div class="result-question-status ${item.isCorrect ? 'correct' : 'incorrect'}">

                        <i class="fas fa-${item.isCorrect ? 'check-circle' : 'times-circle'}"></i>

                        Pregunta ${index + 1} - ${item.isCorrect ? 'Correcta' : 'Incorrecta'}

                    </div>

                    <div class="result-question-text">${item.question}</div>

                    <div style="margin-top: 10px;">

                        <div><strong>Tu respuesta:</strong> ${item.userAnswer}</div>

                        <div><strong>Respuesta correcta:</strong> ${item.correctAnswer}</div>

                        ${item.solution ? `<div style="margin-top: 10px;"><strong>Solucion:</strong> ${item.solution}</div>` : ''}

                    </div>

                `;

                reviewContainer.appendChild(questionDiv);

            });

            

            // Mostrar modal de resultados

            document.getElementById('examResultsModal').classList.add('active');

            

            // Renderizar MathJax

            if (window.MathJax) {

                MathJax.typesetPromise()

                    .catch(err => console.log('MathJax error:', err));

            }

        }

        

        function restartExam() {

            document.getElementById('examResultsModal').classList.remove('active');

            switchMode('exam');

        }

        

        function closeResults() {

            document.getElementById('examResultsModal').classList.remove('active');

            switchMode('study');

        }

        async function viewSimulatorResults() {
            if ((!selectedSimulator || !selectedSimulator.last_score) && allSimulators && allSimulators.length > 0) {
                const attempted = allSimulators
                    .filter(sim => sim && sim.last_score)
                    .sort((a, b) => a.name.localeCompare(b.name));
                if (attempted.length > 0) {
                    selectedSimulator = attempted[0];
                }
            }

            if (!selectedSimulator) {
                showNotification('No hay simuladores disponibles', 'warning');
                return;
            }

            try {
                const response = await fetch(`/api/simulators/${encodeURIComponent(selectedSimulator.name)}/results`);
                const data = await response.json();
                if (!data.success) {
                    showNotification(data.error || 'No se pudieron cargar resultados', 'error');
                    return;
                }
                renderSimulatorResults(data);
                document.getElementById('simulatorResultsModal').classList.add('active');
            } catch (error) {
                console.error('Error cargando resultados:', error);
                showNotification('Error de conexion', 'error');
            }
        }

        function renderSimulatorResults(data) {
            const title = document.getElementById('simulatorResultsTitle');
            const subtitle = document.getElementById('simulatorResultsSubtitle');
            const wrap = document.getElementById('simulatorResultsTableWrap');
            if (!title || !subtitle || !wrap) return;

            title.textContent = `Resultados: ${data.simulator || 'Simulador'}`;
            const rows = Array.isArray(data.results) ? data.results : [];
            const sections = Array.isArray(data.sections) ? data.sections : [];
            subtitle.textContent = '';

            if (rows.length === 0) {
                wrap.innerHTML = '<div class="empty-state">Aun no hay resultados para este simulador.</div>';
                return;
            }

            const headerCols = ['#', 'Alumno', 'Grupo', ...sections, 'Total'];
            const thead = `<thead><tr>${headerCols.map(col => `<th>${col}</th>`).join('')}</tr></thead>`;
            const tbody = rows.map(row => {
                const sectionCols = sections.map(section => {
                    const stats = row.section_scores && row.section_scores[section]
                        ? row.section_scores[section]
                        : { correct: 0, total: 0 };
                    return `<td>${stats.correct}/${stats.total}</td>`;
                }).join('');
                return `
                    <tr>
                        <td>${row.position || '-'}</td>
                        <td>${row.student_name || 'Alumno'}</td>
                        <td>${row.student_group || '-'}</td>
                        ${sectionCols}
                        <td>${row.correct || 0}/${row.total || 0}</td>
                    </tr>
                `;
            }).join('');

            wrap.innerHTML = `
                <div class="sim-results-table-wrap">
                    <table class="sim-results-table">
                        ${thead}
                        <tbody>${tbody}</tbody>
                    </table>
                </div>
            `;
        }

        function closeSimulatorResults() {
            const modal = document.getElementById('simulatorResultsModal');
            if (modal) modal.classList.remove('active');
        }

        

        // ========== FUNCIONES GENERALES ==========

        function showNotification(message, type = 'success') {

            const notification = document.getElementById('notification');

            notification.textContent = message;

            notification.className = `notification ${type}`;

            notification.style.display = 'block';

            

            setTimeout(() => {

                notification.style.display = 'none';

            }, 3000);

        }

        

        // Cerrar modales al hacer clic fuera

        document.querySelectorAll('.modal-overlay, .exam-results-modal').forEach(modal => {

            modal.addEventListener('click', function(e) {

                if (e.target === this) {

                    if (modal.id === 'studyQuestionModal') closeStudyModal();

                    if (modal.id === 'examResultsModal') closeResults();
                    if (modal.id === 'simulatorResultsModal') closeSimulatorResults();

                }

            });

        });

        

        // Cerrar modales con Escape

        document.addEventListener('keydown', function(e) {

            if (e.key === 'Escape') {

                closeStudyModal();

                closeResults();
                closeSimulatorResults();

                

                if (examState.active) {

                    if (!confirm('Â¿EstÃ¡s seguro de que quieres salir del examen? Se perderan tus respuestas.')) return;

                    finishExam();

                }

            }

        });

        

        // Manejar cierre de ventana durante examen

        window.addEventListener('beforeunload', function(e) {

            if (examState.active && !examState.submitted) {

                e.preventDefault();

                e.returnValue = 'Tienes un examen en progreso. ¿Estas seguro de que quieres salir?';

            }

        });

    

        
