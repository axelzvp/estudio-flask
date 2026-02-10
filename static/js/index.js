        let allQuestions = [];
        let studySelectedSubject = 'todos';
        let studySelectedTopic = 'todos';
        
        // Inicializar aplicación
        document.addEventListener('DOMContentLoaded', async function() {
            await loadStudyData();
            initStudyApp();
        });
        
        async function loadStudyData() {
            try {
                // Cargar preguntas
                const response = await fetch('/api/questions');
                const data = await response.json();
                
                if (data.success) {
                    allQuestions = data.questions;
                    loadStudySubjects();
                }
            } catch (error) {
                console.error('Error cargando preguntas:', error);
                showNotification('Error al cargar las preguntas', 'error');
            }
        }
        
        function initStudyApp() {
            // Botón para obtener pregunta aleatoria
            document.getElementById('getQuestionBtn').addEventListener('click', getRandomQuestion);
        }
        
        function loadStudySubjects() {
            const container = document.getElementById('subjectButtons');
            if (!container) return;
            
            container.innerHTML = '';
            
            // Agregar "Todas las materias"
            const allBtn = document.createElement('div');
            allBtn.className = 'subject-btn active';
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
            });
            container.appendChild(allBtn);
            
            // Agregar cada materia
            const subjects = [...new Set(allQuestions.map(q => q.subject))];
            subjects.forEach(subject => {
                const count = allQuestions.filter(q => q.subject === subject).length;
                if (count === 0) return;
                
                const btn = document.createElement('div');
                btn.className = 'subject-btn';
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
                
                // Filtrar temas de la materia seleccionada
                const topics = [...new Set(
                    allQuestions
                        .filter(q => q.subject === studySelectedSubject)
                        .map(q => q.topic)
                )].sort();
                
                if (topics.length > 0) {
                    document.getElementById('currentSubjectName').textContent = studySelectedSubject;
                    
                    // Agregar "Todos los temas"
                    const allBtn = document.createElement('div');
                    allBtn.className = studySelectedTopic === 'todos' ? 'topic-btn-with-action all-topics active' : 'topic-btn-with-action all-topics';
                    allBtn.innerHTML = `
                        <div class="topic-btn-content">
                            <i class="fas fa-layer-group"></i> Todos los temas
                        </div>
                    `;
                    allBtn.dataset.topic = 'todos';
                    allBtn.addEventListener('click', function() {
                        document.querySelectorAll('.topic-btn-with-action').forEach(b => b.classList.remove('active'));
                        this.classList.add('active');
                        studySelectedTopic = 'todos';
                    });
                    container.appendChild(allBtn);
                    
                    // Agregar cada tema
                    topics.forEach(topic => {
                        const btn = document.createElement('div');
                        btn.className = studySelectedTopic === topic ? 'topic-btn-with-action active' : 'topic-btn-with-action';
                        btn.innerHTML = `
                            <div class="topic-btn-content">
                                <i class="fas fa-folder"></i> ${topic}
                            </div>
                        `;
                        btn.dataset.topic = topic;
                        btn.addEventListener('click', function() {
                            document.querySelectorAll('.topic-btn-with-action').forEach(b => b.classList.remove('active'));
                            this.classList.add('active');
                            studySelectedTopic = topic;
                        });
                        container.appendChild(btn);
                    });
                }
            } catch (error) {
                console.error('Error cargando temas:', error);
                topicSelector.style.display = 'none';
            }
        }
        
        async function getRandomQuestion() {
            if (allQuestions.length === 0) {
                showNotification('No hay preguntas disponibles', 'warning');
                return;
            }
            
            let url = `/api/questions/random`;
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
                    displayStudyQuestion(data.question);
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
        
        function displayStudyQuestion(question) {
            document.getElementById('modalQuestionSubject').textContent = question.subject;
            document.getElementById('modalQuestionTopic').textContent = question.topic;
            document.getElementById('modalQuestionUniversity').textContent = question.university || 'General';
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

            questionTextEl.innerHTML = question.question;
            
            optionsContainer.innerHTML = '';
            
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
            
            answerTextEl.innerHTML = question.answer || question.correct_answer || '';
            solutionTextEl.innerHTML = question.solution || '';
            document.getElementById('modalAnswerSection').style.display = 'none';
            
            document.getElementById('studyQuestionModal').style.display = 'flex';
            
            if (window.MathJax) {
                MathJax.typesetPromise()
                    .catch(err => console.log('MathJax error:', err))
                    .finally(() => {
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
            } else {
                [questionTextEl, optionsContainer, answerTextEl, solutionTextEl].forEach(el => {
                    if (el) el.style.visibility = '';
                });
                if (optionsContainer) {
                    optionsContainer.style.display = '';
                }
            }
        }
        
        function checkAnswer(selectedIndex, questionId) {
            const question = allQuestions.find(q => q._id === questionId);
            if (!question || !question.has_options) return;
            
            const optionCards = document.querySelectorAll('#modalOptionsContainer .option-card');
            const isCorrect = selectedIndex === question.correct_option;
            
            optionCards.forEach(card => {
                card.style.cursor = 'not-allowed';
                card.onclick = null;
            });
            
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
            
            if (!isCorrect && question.correct_option >= 0) {
                const correctCard = optionCards[question.correct_option];
                if (correctCard) {
                    correctCard.classList.add('correct');
                }
            }
            
            if (question.solution && question.solution.trim() !== '') {
                document.getElementById('modalSolutionText').innerHTML = 
                    `<div class="solution-box">
                        <h4><i class="fas fa-list-ol"></i> Solución Detallada</h4>
                        <div>${question.solution}</div>
                    </div>`;
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
        
        function showNotification(message, type = 'success') {
            const notification = document.getElementById('notification');
            notification.textContent = message;
            notification.className = `notification ${type}`;
            notification.style.display = 'block';
            
            setTimeout(() => {
                notification.style.display = 'none';
            }, 4000);
        }
    
