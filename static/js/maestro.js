
        let currentUser = null;
        let userRole = null;
        let allQuestions = [];
        let allStudents = [];
        let currentStudentGroup = 'todos';
        let studentGroupsSummary = [];
        let pendingGroupDelete = null;
        let currentPage = 1;
        let itemsPerPage = 12;
        let currentSearch = '';
        let currentFilters = {
            subject: 'todos',
            topic: 'todos',
            university: 'todos',
            type: 'todos'
        };
        let questionToDelete = null;
        let isEditMode = false;
        let currentEditQuestionId = null;
        let studySelectedSubject = 'todos';
        let studySelectedTopic = 'todos';
        let currentImageFile = null;
        let adminResultsCache = [];
let existingImageUrl = null;
        
        // Verificar autenticación y rol
        document.addEventListener('DOMContentLoaded', async function() {
            await checkAuthentication();
            
            if (currentUser && userRole === 'maestro') {
                setupUserInterface();
                initMaestroApp();
                loadAllData();
            } else {
                // Redirigir a login si no es maestro
                window.location.href = '/login';
            }
        });
        
        async function checkAuthentication() {
            try {
                const response = await fetch('/api/current-user');
                const data = await response.json();
                
                if (data.success) {
                    currentUser = data.user;
                    userRole = data.user.rol;
                    return true;
                } else {
                    return false;
                }
            } catch (error) {
                console.error('Auth check error:', error);
                return false;
            }
        }

        function activateMaestroPage(pageKey) {
            if (!pageKey) return;

            document.querySelectorAll('.menu-item[data-page]').forEach(i => i.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

            const menuItem = document.querySelector(`.menu-item[data-page="${pageKey}"]`);
            if (menuItem) {
                menuItem.classList.add('active');
            }

            const page = document.getElementById(`${pageKey}Page`);
            if (page) {
                page.classList.add('active');
            }

            document.querySelectorAll('.mobile-focus-btn[data-page]').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.page === pageKey);
            });

            if (pageKey === 'questions') {
                loadQuestionsPage();
            } else if (pageKey === 'stats') {
                loadStatsPage();
            } else if (pageKey === 'simulators') {
                loadSimulatorsPage();
            } else if (pageKey === 'results') {
                loadResultsPage();
            } else if (pageKey === 'students') {
                loadStudentsPage();
            }
        }
        
        function setupUserInterface() {
            // Actualizar información del usuario
            document.getElementById('userGreeting').textContent = `Panel de Maestro`;
            document.getElementById('userName').textContent = `${currentUser.nombre} ${currentUser.apellido}`;
            
            // Configurar eventos del menú
            document.querySelectorAll('.menu-item[data-page]').forEach(item => {
                item.addEventListener('click', function() {
                    if (this.id === 'openModalBtn') {
                        openModal();
                        return;
                    }

                    activateMaestroPage(this.dataset.page);
                });
            });

            document.querySelectorAll('.mobile-focus-btn[data-page]').forEach(btn => {
                btn.addEventListener('click', function() {
                    activateMaestroPage(this.dataset.page);
                });
            });

            if (window.matchMedia('(max-width: 768px)').matches) {
                activateMaestroPage('simulators');
            }
            
            // Botón de logout
            document.getElementById('logoutBtn').addEventListener('click', logout);
            
            // Botones flotantes y de modal
            // Y cámbialas para usar window.openModal (la función de app.js):
            const openModalBtn = document.getElementById('openModalBtn');
            if (openModalBtn) {
                openModalBtn.addEventListener('click', function() {
                    window.openModal();
                });
            }
            const openModalFromListBtn = document.getElementById('openModalFromListBtn');
            if (openModalFromListBtn) {
                openModalFromListBtn.addEventListener('click', function() {
                    window.openModal();
                });
            }
            const openStudentModalBtn = document.getElementById('openStudentModalBtn');
            if (openStudentModalBtn) {
                openStudentModalBtn.addEventListener('click', openStudentModal);
            }
            const openStudentModalMenuBtn = document.getElementById('openStudentModalMenuBtn');
            if (openStudentModalMenuBtn) {
                openStudentModalMenuBtn.addEventListener('click', openStudentModal);
            }
            const openStudentModalFromStudentsBtn = document.getElementById('openStudentModalFromStudentsBtn');
            if (openStudentModalFromStudentsBtn) {
                openStudentModalFromStudentsBtn.addEventListener('click', openStudentModal);
            }
            const floatingNewQuestionBtn = document.getElementById('floatingNewQuestionBtn');
            if (floatingNewQuestionBtn) {
                floatingNewQuestionBtn.addEventListener('click', function() {
                    window.openModal();
                });
            }
            const addFirstQuestionBtn = document.getElementById('addFirstQuestionBtn');
            if (addFirstQuestionBtn) {
                addFirstQuestionBtn.addEventListener('click', function() {
                    window.openModal();
                });
            }
            // Botón de ayuda
            document.getElementById('showHelpBtn').addEventListener('click', function() {
                document.getElementById('helpModal').classList.add('active');
            });
            
            // Cerrar modales
            document.querySelectorAll('#helpModal .modal-close, #helpModal .btn-primary').forEach(btn => {
                btn.addEventListener('click', function() {
                    document.getElementById('helpModal').classList.remove('active');
                });
            });
        }
        
        function initMaestroApp() {
            // Modal de preguntas - Eventos de cierre
            document.getElementById('closeModalBtn').addEventListener('click', function() {
                window.closeModal(); // Usar la función de app.js
            });
            document.getElementById('cancelModalBtn').addEventListener('click', function() {
                window.closeModal(); // Usar la función de app.js
            });
            document.getElementById('saveQuestionBtn').addEventListener('click', saveQuestion);
            
            // Teclados matemáticos - Inicializar
            initMathToolbars();
            initPix2TextUploader();
            
            // Filtros
            document.getElementById('subjectFilter').addEventListener('change', function() {
                updateTopicFilter();
                applyFilters();
            });
            document.getElementById('topicFilter').addEventListener('change', applyFilters);
            document.getElementById('universityFilter').addEventListener('change', applyFilters);
            document.getElementById('typeFilter').addEventListener('change', applyFilters);
            document.getElementById('clearFiltersBtn').addEventListener('click', clearFilters);
            
            // Búsqueda
            document.getElementById('searchBtn').addEventListener('click', performSearch);
            document.getElementById('searchInput').addEventListener('keydown', function(e) {
                if (e.key === 'Enter') performSearch();
            });
            document.getElementById('clearSearchBtn').addEventListener('click', clearSearch);
            
            // Paginación
            document.getElementById('prevPageBtn').addEventListener('click', prevPage);
            document.getElementById('nextPageBtn').addEventListener('click', nextPage);
            
            // Modo estudio
            document.getElementById('getQuestionBtn').addEventListener('click', getRandomQuestion);
            
            // Universidad personalizada en modal
            const modalUniversitySelect = document.getElementById('modalUniversity');
            const modalNewUniversityInput = document.getElementById('modalNewUniversity');
            
            modalUniversitySelect.addEventListener('change', function() {
                if (this.value === '_new_') {
                    modalNewUniversityInput.style.display = 'block';
                    modalNewUniversityInput.focus();
                } else {
                    modalNewUniversityInput.style.display = 'none';
                }
            });

            // Materia en modal (para cargar temas)
            const modalSubjectSelect = document.getElementById('modalSubject');
            const modalNewSubjectInput = document.getElementById('modalNewSubject');
            if (modalSubjectSelect) {
                modalSubjectSelect.addEventListener('change', function() {
                    if (this.value === '_new_') {
                        modalNewSubjectInput.style.display = 'block';
                        modalNewSubjectInput.focus();
                        loadModalTopics('');
                    } else {
                        modalNewSubjectInput.style.display = 'none';
                        loadModalTopics(this.value);
                    }
                });
            }

            // Simulador en modal
            const simulatorCheckbox = document.getElementById('modalIsSimulator');
            const simulatorNameInput = document.getElementById('modalSimulatorName');
            if (simulatorCheckbox && simulatorNameInput) {
                simulatorCheckbox.addEventListener('change', toggleSimulatorMode);
            }
            
            // Checkbox para opciones múltiples
            const hasOptionsCheckbox = document.getElementById('hasOptionsCheckbox');
            if (hasOptionsCheckbox) {
                hasOptionsCheckbox.addEventListener('change', toggleOptions);
            }
            
            // Configurar botón de eliminar en modal de confirmación
            document.getElementById('confirmDeleteBtn').addEventListener('click', deleteQuestion);
            const closeStudentModalBtn = document.getElementById('closeStudentModalBtn');
            const cancelStudentModalBtn = document.getElementById('cancelStudentModalBtn');
            const createStudentBtn = document.getElementById('createStudentBtn');
            const createTeacherBtn = document.getElementById('createTeacherBtn');
            if (closeStudentModalBtn) {
                closeStudentModalBtn.addEventListener('click', closeStudentModal);
            }
            if (cancelStudentModalBtn) {
                cancelStudentModalBtn.addEventListener('click', closeStudentModal);
            }
            if (createStudentBtn) {
                createStudentBtn.addEventListener('click', createStudent);
            }
            if (createTeacherBtn) {
                createTeacherBtn.addEventListener('click', createTeacher);
            }
            const closeStudentCredentialsModalBtn = document.getElementById('closeStudentCredentialsModalBtn');
            const closeStudentCredentialsBtn = document.getElementById('closeStudentCredentialsBtn');
            const copyStudentCredentialsBtn = document.getElementById('copyStudentCredentialsBtn');
            if (closeStudentCredentialsModalBtn) {
                closeStudentCredentialsModalBtn.addEventListener('click', closeStudentCredentialsModal);
            }
            if (closeStudentCredentialsBtn) {
                closeStudentCredentialsBtn.addEventListener('click', closeStudentCredentialsModal);
            }
            if (copyStudentCredentialsBtn) {
                copyStudentCredentialsBtn.addEventListener('click', copyStudentCredentials);
            }
            const closeGroupDeleteModalBtn = document.getElementById('closeGroupDeleteModalBtn');
            const cancelGroupDeleteBtn = document.getElementById('cancelGroupDeleteBtn');
            const confirmGroupDeleteBtn = document.getElementById('confirmGroupDeleteBtn');
            if (closeGroupDeleteModalBtn) {
                closeGroupDeleteModalBtn.addEventListener('click', closeGroupDeleteModal);
            }
            if (cancelGroupDeleteBtn) {
                cancelGroupDeleteBtn.addEventListener('click', closeGroupDeleteModal);
            }
            if (confirmGroupDeleteBtn) {
                confirmGroupDeleteBtn.addEventListener('click', confirmGroupDelete);
            }
            const studentModal = document.getElementById('studentModal');
            if (studentModal) {
                studentModal.addEventListener('click', function(e) {
                    if (e.target === studentModal) {
                        closeStudentModal();
                    }
                });
            }
            const studentCredentialsModal = document.getElementById('studentCredentialsModal');
            if (studentCredentialsModal) {
                studentCredentialsModal.addEventListener('click', function(e) {
                    if (e.target === studentCredentialsModal) {
                        closeStudentCredentialsModal();
                    }
                });
            }
            const groupDeleteModal = document.getElementById('groupDeleteModal');
            if (groupDeleteModal) {
                groupDeleteModal.addEventListener('click', function(e) {
                    if (e.target === groupDeleteModal) {
                        closeGroupDeleteModal();
                    }
                });
            }

            // Simuladores
            const refreshSimBtn = document.getElementById('refreshSimulatorsBtn');
            if (refreshSimBtn) {
                refreshSimBtn.addEventListener('click', loadSimulatorsPage);
            }
            const refreshResultsBtn = document.getElementById('refreshResultsBtn');
            if (refreshResultsBtn) {
                refreshResultsBtn.addEventListener('click', loadResultsPage);
            }
            const createSimBtn = document.getElementById('createSimulatorBtn');
            if (createSimBtn) {
                createSimBtn.addEventListener('click', createSimulator);
            }
            const openSimulatorCreateBtn = document.getElementById('openSimulatorCreateModalBtn');
            if (openSimulatorCreateBtn) {
                openSimulatorCreateBtn.addEventListener('click', openSimulatorCreateModal);
            }
            const closeSimulatorCreateBtn = document.getElementById('closeSimulatorCreateModalBtn');
            if (closeSimulatorCreateBtn) {
                closeSimulatorCreateBtn.addEventListener('click', closeSimulatorCreateModal);
            }
            const cancelSimulatorCreateBtn = document.getElementById('cancelSimulatorCreateModalBtn');
            if (cancelSimulatorCreateBtn) {
                cancelSimulatorCreateBtn.addEventListener('click', closeSimulatorCreateModal);
            }
            const simulatorCreateModal = document.getElementById('simulatorCreateModal');
            if (simulatorCreateModal) {
                simulatorCreateModal.addEventListener('click', function(e) {
                    if (e.target === simulatorCreateModal) {
                        closeSimulatorCreateModal();
                    }
                });
            }
            const closeSimulatorEditBtn = document.getElementById('closeSimulatorEditModalBtn');
            if (closeSimulatorEditBtn) {
                closeSimulatorEditBtn.addEventListener('click', closeSimulatorEditModal);
            }
            const cancelSimulatorEditBtn = document.getElementById('cancelSimulatorEditModalBtn');
            if (cancelSimulatorEditBtn) {
                cancelSimulatorEditBtn.addEventListener('click', closeSimulatorEditModal);
            }
            const saveSimulatorEditBtn = document.getElementById('saveSimulatorEditBtn');
            if (saveSimulatorEditBtn) {
                saveSimulatorEditBtn.addEventListener('click', saveSimulatorEdit);
            }
            const simulatorEditModal = document.getElementById('simulatorEditModal');
            if (simulatorEditModal) {
                simulatorEditModal.addEventListener('click', function(e) {
                    if (e.target === simulatorEditModal) {
                        closeSimulatorEditModal();
                    }
                });
            }
            const closeSimulatorAttendanceModalBtn = document.getElementById('closeSimulatorAttendanceModalBtn');
            if (closeSimulatorAttendanceModalBtn) {
                closeSimulatorAttendanceModalBtn.addEventListener('click', closeSimulatorAttendanceModal);
            }
            const closeSimulatorAttendanceBtn = document.getElementById('closeSimulatorAttendanceBtn');
            if (closeSimulatorAttendanceBtn) {
                closeSimulatorAttendanceBtn.addEventListener('click', closeSimulatorAttendanceModal);
            }
            const refreshAttendanceBtn = document.getElementById('refreshAttendanceBtn');
            if (refreshAttendanceBtn) {
                refreshAttendanceBtn.addEventListener('click', function() {
                    const simulatorName = (document.getElementById('attendanceSimulatorName')?.value || '').trim();
                    if (simulatorName) loadSimulatorAttendance(simulatorName);
                });
            }
            const attendanceGroupFilter = document.getElementById('attendanceGroupFilter');
            if (attendanceGroupFilter) {
                attendanceGroupFilter.addEventListener('change', function() {
                    const simulatorName = (document.getElementById('attendanceSimulatorName')?.value || '').trim();
                    if (simulatorName) loadSimulatorAttendance(simulatorName);
                });
            }
            const simulatorAttendanceModal = document.getElementById('simulatorAttendanceModal');
            if (simulatorAttendanceModal) {
                simulatorAttendanceModal.addEventListener('click', function(e) {
                    if (e.target === simulatorAttendanceModal) {
                        closeSimulatorAttendanceModal();
                    }
                });
            }
            const simulatorList = document.getElementById('simulatorListAdmin');
            if (simulatorList) {
                simulatorList.addEventListener('click', handleSimulatorListClick);
            }
            const resultsList = document.getElementById('resultsListsAdmin');
            if (resultsList) {
                resultsList.addEventListener('click', handleResultsListClick);
            }
            const closeResultsAdminModalBtn = document.getElementById('closeResultsAdminModalBtn');
            if (closeResultsAdminModalBtn) {
                closeResultsAdminModalBtn.addEventListener('click', closeResultsAdminModal);
            }
            const closeResultsAdminModalFooterBtn = document.getElementById('closeResultsAdminModalFooterBtn');
            if (closeResultsAdminModalFooterBtn) {
                closeResultsAdminModalFooterBtn.addEventListener('click', closeResultsAdminModal);
            }
            const resultsAdminModal = document.getElementById('resultsAdminModal');
            if (resultsAdminModal) {
                resultsAdminModal.addEventListener('click', function(e) {
                    if (e.target === resultsAdminModal) {
                        closeResultsAdminModal();
                    }
                });
            }
            const refreshStudentsBtn = document.getElementById('refreshStudentsBtn');
            if (refreshStudentsBtn) {
                refreshStudentsBtn.addEventListener('click', loadStudentsPage);
            }
            document.addEventListener('click', function(e) {
                if (e.target.closest('.group-actions') || e.target.closest('.simulator-actions')) return;
                document.querySelectorAll('.group-actions-menu.open').forEach(menu => {
                    menu.classList.remove('open');
                });
                document.querySelectorAll('.simulator-actions-menu.open').forEach(menu => {
                    menu.classList.remove('open');
                });
            });

            // Listas de simuladores para autocompletar en modal y carga masiva
            loadSimulatorNameOptions();
        }

        function openStudentModal() {
            const modal = document.getElementById('studentModal');
            if (!modal) return;
            resetStudentForm();
            modal.classList.add('active');
        }

        function closeStudentModal() {
            const modal = document.getElementById('studentModal');
            if (!modal) return;
            modal.classList.remove('active');
            resetStudentForm();
        }

        function openStudentCredentialsModal(email, password, role = 'alumno') {
            const modal = document.getElementById('studentCredentialsModal');
            const emailEl = document.getElementById('studentCredentialsEmail');
            const passwordEl = document.getElementById('studentCredentialsPassword');
            const titleEl = document.getElementById('studentCredentialsTitle');
            const hintEl = document.getElementById('studentCredentialsHint');
            if (!modal || !emailEl || !passwordEl) return;
            const roleLabel = role === 'maestro' ? 'Maestro' : 'Alumno';
            emailEl.textContent = email || '-';
            passwordEl.textContent = password || '-';
            if (titleEl) {
                titleEl.innerHTML = `<i class="fas fa-id-card"></i> Datos del ${roleLabel}`;
            }
            if (hintEl) {
                hintEl.textContent = `Comparte estos datos con el ${roleLabel.toLowerCase()}:`;
            }
            modal.classList.add('active');
        }

        function closeStudentCredentialsModal() {
            const modal = document.getElementById('studentCredentialsModal');
            if (!modal) return;
            modal.classList.remove('active');
        }

        function openGroupDeleteModal(group) {
            pendingGroupDelete = group;
            const modal = document.getElementById('groupDeleteModal');
            const warning = document.getElementById('groupDeleteWarningText');
            const input = document.getElementById('groupDeleteConfirmInput');
            if (!modal || !warning || !input) return;
            warning.textContent = `Vas a eliminar el grupo "${group}" y borrar definitivamente todos sus alumnos.`;
            input.value = '';
            modal.classList.add('active');
            input.focus();
        }

        function closeGroupDeleteModal() {
            const modal = document.getElementById('groupDeleteModal');
            const input = document.getElementById('groupDeleteConfirmInput');
            if (modal) modal.classList.remove('active');
            if (input) input.value = '';
            pendingGroupDelete = null;
        }

        async function confirmGroupDelete() {
            const group = pendingGroupDelete;
            const input = document.getElementById('groupDeleteConfirmInput');
            if (!group || !input) return;
            if ((input.value || '').trim() !== group) {
                showNotification('Confirmación cancelada: nombre de grupo no coincide', 'warning');
                return;
            }
            try {
                const response = await fetch(`/api/students/groups/${encodeURIComponent(group)}`, {
                    method: 'DELETE'
                });
                const data = await response.json();
                if (data.success) {
                    if (currentStudentGroup === group) currentStudentGroup = 'todos';
                    const deleted = data.deleted_count || 0;
                    showNotification(`Grupo eliminado (${deleted} alumnos borrados)`, 'success');
                    closeGroupDeleteModal();
                    loadStudentsPage();
                } else {
                    showNotification(data.error || 'Error al eliminar grupo', 'error');
                }
            } catch (error) {
                console.error('Error eliminando grupo:', error);
                showNotification('Error de conexión', 'error');
            }
        }

        async function copyStudentCredentials() {
            const email = document.getElementById('studentCredentialsEmail')?.textContent || '';
            const password = document.getElementById('studentCredentialsPassword')?.textContent || '';
            const text = `Correo: ${email}\nContrasena: ${password}`;
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(text);
                    showNotification('Datos copiados al portapapeles', 'success');
                    return;
                }
                throw new Error('Clipboard API no disponible');
            } catch (error) {
                try {
                    const tempInput = document.createElement('textarea');
                    tempInput.value = text;
                    tempInput.setAttribute('readonly', '');
                    tempInput.style.position = 'fixed';
                    tempInput.style.left = '-9999px';
                    document.body.appendChild(tempInput);
                    tempInput.select();
                    document.execCommand('copy');
                    document.body.removeChild(tempInput);
                    showNotification('Datos copiados al portapapeles', 'success');
                } catch (fallbackError) {
                    console.error('Error copiando datos:', error, fallbackError);
                    showNotification('No se pudo copiar. Intenta manualmente.', 'error');
                }
            }
        }

        function resetStudentForm() {
            const ids = ['studentNombre', 'studentApellido', 'studentEmail', 'studentPassword', 'studentGroup'];
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
        }

        async function createUser(role, buttonId) {
            const nombre = (document.getElementById('studentNombre')?.value || '').trim();
            const apellido = (document.getElementById('studentApellido')?.value || '').trim();
            const email = (document.getElementById('studentEmail')?.value || '').trim();
            const password = (document.getElementById('studentPassword')?.value || '').trim();
            const grupo = (document.getElementById('studentGroup')?.value || '').trim();

            if (!nombre || !apellido || !email || !password) {
                showNotification('Completa nombre, apellido, correo y contrasena', 'error');
                return;
            }
            if (role === 'alumno' && !grupo) {
                showNotification('Completa todos los campos del alumno', 'error');
                return;
            }

            const btn = document.getElementById(buttonId);
            const originalText = btn ? btn.innerHTML : '';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';
            }

            try {
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nombre,
                        apellido,
                        email,
                        password,
                        grupo,
                        rol: role
                    })
                });
                const data = await response.json();

                if (data.success) {
                    const roleLabel = role === 'maestro' ? 'Maestro' : 'Alumno';
                    showNotification(`${roleLabel} registrado correctamente`, 'success');
                    closeStudentModal();
                    openStudentCredentialsModal(email, password, role);
                    loadStudentsPage();
                } else {
                    showNotification(data.error || 'Error al registrar usuario', 'error');
                }
            } catch (error) {
                console.error('Error registrando usuario:', error);
                showNotification('Error de conexión', 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                }
            }
        }

        async function createStudent() {
            return createUser('alumno', 'createStudentBtn');
        }

        async function createTeacher() {
            return createUser('maestro', 'createTeacherBtn');
        }

        document.addEventListener('keydown', function(e) {
            const modal = document.getElementById('studentModal');
            const groupDeleteModal = document.getElementById('groupDeleteModal');
            if (e.key === 'Enter') {
                if (groupDeleteModal && groupDeleteModal.classList.contains('active')) {
                    e.preventDefault();
                    confirmGroupDelete();
                    return;
                }
                if (!modal || !modal.classList.contains('active')) return;
                e.preventDefault();
                createStudent();
            }
            if (e.key === 'Escape') {
                closeStudentModal();
                closeStudentCredentialsModal();
                closeGroupDeleteModal();
            }
        });
        
        function initMathToolbars() {
            // Inicializar todos los teclados matemáticos
            ['questionMathToolbar', 'answerMathToolbar', 'solutionMathToolbar'].forEach(toolbarId => {
                const toolbar = document.getElementById(toolbarId);
                if (toolbar) {
                    toolbar.addEventListener('click', function(e) {
                        if (e.target.classList.contains('math-btn')) {
                            const symbol = e.target.dataset.symbol;
                            const targetId = e.target.dataset.target;
                            const textarea = document.getElementById(targetId);
                            
                            if (textarea) {
                                insertSymbolAtCursor(textarea, symbol);
                                textarea.focus();
                            }
                        }
                    });
                }
            });
            
            // Para las opciones múltiples
            document.querySelectorAll('.option-input').forEach(textarea => {
                // Los botones matemáticos para opciones se manejan mediante el evento focus
            });
        }
        
        function insertSymbolAtCursor(textarea, symbol) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = textarea.value;
            
            // Insertar el símbolo en la posición del cursor
            textarea.value = text.substring(0, start) + symbol + text.substring(end);
            
            // Reposicionar el cursor después del símbolo insertado
            const newPosition = start + symbol.length;
            textarea.selectionStart = newPosition;
            textarea.selectionEnd = newPosition;
            
            // Disparar evento de cambio para actualizar MathJax si es necesario
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }

        function setPix2TextStatus(message) {
            const statusEl = document.getElementById('pix2textStatus');
            if (!statusEl) return;
            statusEl.innerHTML = `<i class="fas fa-info-circle"></i> ${message}`;
        }

        function initPix2TextUploader() {
            const fileInput = document.getElementById('pix2textImage');
            const convertBtn = document.getElementById('pix2textBtn');
            if (!fileInput || !convertBtn) return;

            convertBtn.addEventListener('click', async function() {
                if (!fileInput.files || !fileInput.files[0]) {
                    showNotification('Selecciona una imagen de la fórmula', 'warning');
                    return;
                }

                const questionTextarea = document.getElementById('modalQuestion');
                if (!questionTextarea) return;

                const formData = new FormData();
                formData.append('image', fileInput.files[0]);

                convertBtn.disabled = true;
                setPix2TextStatus('Procesando imagen...');

                try {
                    const response = await fetch('/api/pix2text', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await response.json();

                    if (!response.ok || !data.success) {
                        setPix2TextStatus(data.error || 'No se pudo convertir la imagen.');
                        showNotification(data.error || 'Error al convertir la imagen', 'error');
                        return;
                    }

                    const latexRaw = (data.latex || '').trim();
                    if (!latexRaw) {
                        setPix2TextStatus('No se detectó LaTeX en la imagen.');
                        showNotification('No se detectó LaTeX en la imagen', 'warning');
                        return;
                    }

                    let latexToInsert = latexRaw;
                    if (!(latexRaw.startsWith('$$') && latexRaw.endsWith('$$'))) {
                        latexToInsert = `$$${latexRaw}$$`;
                    }

                    insertSymbolAtCursor(questionTextarea, latexToInsert);
                    showNotification('LaTeX insertado en la pregunta', 'success');
                    setPix2TextStatus('LaTeX insertado en la pregunta.');
                    fileInput.value = '';
                } catch (error) {
                    console.error('Pix2Text error:', error);
                    setPix2TextStatus('Error de conexión con el servidor.');
                    showNotification('Error de conexión', 'error');
                } finally {
                    convertBtn.disabled = false;
                }
            });
        }
        
        function handleOptionFocus(event) {
            const textarea = event.target;
            const optionId = textarea.id;
            
            // Determinar qué toolbar matemático usar
            const toolbar = document.getElementById('answerMathToolbar');
            
            // Actualizar todos los botones para que apunten a esta textarea
            if (toolbar) {
                toolbar.querySelectorAll('.math-btn').forEach(btn => {
                    btn.dataset.target = optionId;
                });
            }
        }
        
        function toggleOptions() {
            const hasOptions = document.getElementById('hasOptionsCheckbox').checked;
            const optionsSection = document.getElementById('optionsSection');
            const openAnswerSection = document.getElementById('openAnswerSection');
            
            if (hasOptions) {
                optionsSection.style.display = 'block';
                openAnswerSection.style.display = 'none';
            } else {
                optionsSection.style.display = 'none';
                openAnswerSection.style.display = 'block';
            }
        }

        function toggleSimulatorMode() {
            const simulatorCheckbox = document.getElementById('modalIsSimulator');
            const simulatorNameInput = document.getElementById('modalSimulatorName');
            const simulatorSectionSelect = document.getElementById('modalSimulatorSection');
            const simulatorHint = document.getElementById('simulatorHint');
            const subjectSelect = document.getElementById('modalSubject');
            const topicInput = document.getElementById('modalTopic');
            const newSubjectInput = document.getElementById('modalNewSubject');

            if (!simulatorCheckbox || !simulatorNameInput || !subjectSelect || !topicInput) return;

            if (simulatorCheckbox.checked) {
                simulatorNameInput.style.display = 'block';
                if (simulatorSectionSelect) simulatorSectionSelect.style.display = 'block';
                if (simulatorHint) simulatorHint.style.display = 'block';
                subjectSelect.value = 'Simulador';
                subjectSelect.disabled = true;
                topicInput.disabled = true;
                if (newSubjectInput) newSubjectInput.style.display = 'none';
                if (simulatorSectionSelect && !simulatorSectionSelect.value) {
                    simulatorSectionSelect.value = 'Matemáticas';
                }
                loadModalTopics('');
            } else {
                simulatorNameInput.style.display = 'none';
                if (simulatorSectionSelect) simulatorSectionSelect.style.display = 'none';
                if (simulatorHint) simulatorHint.style.display = 'none';
                subjectSelect.disabled = false;
                topicInput.disabled = false;
                if (subjectSelect.value === 'Simulador') {
                    subjectSelect.value = 'MatemÃ¡ticas';
                }
                if (simulatorSectionSelect) {
                    simulatorSectionSelect.value = '';
                }
                loadModalTopics(subjectSelect.value);
            }
        }

        function toggleBulkSimulatorMode() {
            const simulatorCheckbox = document.getElementById('bulkIsSimulator');
            const simulatorNameInput = document.getElementById('bulkSimulatorName');
            const simulatorSectionSelect = document.getElementById('bulkSimulatorSection');
            const simulatorHint = document.getElementById('bulkSimulatorHint');
            const subjectSelect = document.getElementById('bulkSubject');
            const topicInput = document.getElementById('bulkTopic');
            const newSubjectInput = document.getElementById('bulkNewSubject');

            if (!simulatorCheckbox || !simulatorNameInput || !subjectSelect || !topicInput) return;

            if (simulatorCheckbox.checked) {
                simulatorNameInput.style.display = 'block';
                if (simulatorSectionSelect) simulatorSectionSelect.style.display = 'block';
                if (simulatorHint) simulatorHint.style.display = 'block';
                subjectSelect.value = 'Simulador';
                subjectSelect.disabled = true;
                topicInput.disabled = true;
                if (newSubjectInput) newSubjectInput.style.display = 'none';
                if (simulatorSectionSelect && !simulatorSectionSelect.value) {
                    simulatorSectionSelect.value = 'Matemáticas';
                }
                loadBulkTopics('');
            } else {
                simulatorNameInput.style.display = 'none';
                if (simulatorSectionSelect) simulatorSectionSelect.style.display = 'none';
                if (simulatorHint) simulatorHint.style.display = 'none';
                subjectSelect.disabled = false;
                topicInput.disabled = false;
                if (subjectSelect.value === 'Simulador') {
                    subjectSelect.value = 'MatemÃ¡ticas';
                }
                if (simulatorSectionSelect) {
                    simulatorSectionSelect.value = '';
                }
                loadBulkTopics(subjectSelect.value);
            }
        }

        async function loadModalTopics(subject) {
            const list = document.getElementById('modalTopicList');
            if (!list) return;
            
            list.innerHTML = '';
            if (!subject || subject === 'Simulador' || subject === '_new_') return;
            
            try {
                const response = await fetch(`/api/subjects/${encodeURIComponent(subject)}/topics`);
                const data = await response.json();
                if (data.success && Array.isArray(data.topics)) {
                    data.topics.forEach(topic => {
                        if (!topic) return;
                        const option = document.createElement('option');
                        option.value = topic;
                        list.appendChild(option);
                    });
                }
            } catch (error) {
                console.error('Error cargando temas:', error);
            }
        }

        async function loadBulkTopics(subject) {
            const list = document.getElementById('bulkTopicList');
            if (!list) return;
            
            list.innerHTML = '';
            if (!subject || subject === 'Simulador' || subject === '_new_') return;
            
            try {
                const response = await fetch(`/api/subjects/${encodeURIComponent(subject)}/topics`);
                const data = await response.json();
                if (data.success && Array.isArray(data.topics)) {
                    data.topics.forEach(topic => {
                        if (!topic) return;
                        const option = document.createElement('option');
                        option.value = topic;
                        list.appendChild(option);
                    });
                }
            } catch (error) {
                console.error('Error cargando temas:', error);
            }
        }
        
        async function loadAllData() {
            try {
                // Cargar preguntas
                const response = await fetch('/api/questions');
                const data = await response.json();
                
                if (data.success) {
                    allQuestions = data.questions;
                    updateSidebarStats();
                    updateFilterOptions();
                    loadQuestionsPage();
                }
            } catch (error) {
                console.error('Error cargando datos:', error);
                showNotification('Error al cargar los datos', 'error');
            }
        }
        
        function updateSidebarStats() {
            const total = allQuestions.length;
            const subjects = [...new Set(allQuestions.map(q => q.subject))].length;
            const shown = allQuestions.reduce((sum, q) => sum + (q.times_shown || 0), 0);
            const correct = allQuestions.reduce((sum, q) => sum + (q.times_correct || 0), 0);
            
            const sidebarTotal = document.getElementById('sidebarTotal');
            const sidebarSubjects = document.getElementById('sidebarSubjects');
            const sidebarShown = document.getElementById('sidebarShown');
            
            if (sidebarTotal) sidebarTotal.textContent = total;
            if (sidebarSubjects) sidebarSubjects.textContent = subjects;
            if (sidebarShown) sidebarShown.textContent = shown;
            
            // Actualizar resumen estadístico si existe en el DOM
            const totalQuestionsStat = document.getElementById('totalQuestionsStat');
            const totalSubjectsStat = document.getElementById('totalSubjectsStat');
            const totalShownStat = document.getElementById('totalShownStat');
            const totalCorrectStat = document.getElementById('totalCorrectStat');
            
            if (totalQuestionsStat) totalQuestionsStat.textContent = total;
            if (totalSubjectsStat) totalSubjectsStat.textContent = subjects;
            if (totalShownStat) totalShownStat.textContent = shown;
            if (totalCorrectStat) totalCorrectStat.textContent = correct;
        }
        
        function updateFilterOptions() {
            const subjectSelect = document.getElementById('subjectFilter');
            subjectSelect.innerHTML = '<option value="todos">Todas las materias</option>';
            
            const subjects = [...new Set(allQuestions.map(q => q.subject))].sort();
            subjects.forEach(subject => {
                const option = document.createElement('option');
                option.value = subject;
                option.textContent = subject;
                subjectSelect.appendChild(option);
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
                // Obtener temas únicos de la materia seleccionada
                const topics = [...new Set(
                    allQuestions
                        .filter(q => q.subject === subject)
                        .map(q => q.topic)
                )].sort();
                
                topics.forEach(topic => {
                    const option = document.createElement('option');
                    option.value = topic;
                    option.textContent = topic;
                    topicFilter.appendChild(option);
                });
                
                // Restaurar selección si aún existe
                if (topics.includes(currentTopic)) {
                    topicFilter.value = currentTopic;
                }
            }
        }
        
        function applyFilters() {
            currentFilters = {
                subject: document.getElementById('subjectFilter').value,
                topic: document.getElementById('topicFilter').value,
                university: document.getElementById('universityFilter').value,
                type: document.getElementById('typeFilter').value
            };
            
            currentPage = 1;
            displayQuestions();
        }
        
        function performSearch() {
            currentSearch = document.getElementById('searchInput').value.trim().toLowerCase();
            currentPage = 1;
            displayQuestions();
        }
        
        function clearSearch() {
            document.getElementById('searchInput').value = '';
            currentSearch = '';
            currentPage = 1;
            displayQuestions();
        }
        
        function clearFilters() {
            document.getElementById('subjectFilter').value = 'todos';
            document.getElementById('topicFilter').value = 'todos';
            document.getElementById('universityFilter').value = 'todos';
            document.getElementById('typeFilter').value = 'todos';
            document.getElementById('searchInput').value = '';
            
            currentFilters = {
                subject: 'todos',
                topic: 'todos',
                university: 'todos',
                type: 'todos'
            };
            currentSearch = '';
            currentPage = 1;
            
            displayQuestions();
        }
        
        function displayQuestions() {
            // Filtrar preguntas
            let filteredQuestions = allQuestions.filter(question => {
                // Filtrar por materia
                if (currentFilters.subject !== 'todos' && question.subject !== currentFilters.subject) {
                    return false;
                }
                
                // Filtrar por tema
                if (currentFilters.topic !== 'todos' && question.topic !== currentFilters.topic) {
                    return false;
                }
                
                // Filtrar por universidad
                if (currentFilters.university !== 'todos' && question.university !== currentFilters.university) {
                    return false;
                }
                
                // Filtrar por tipo
                if (currentFilters.type !== 'todos') {
                    if (currentFilters.type === 'opciones' && !question.has_options) {
                        return false;
                    }
                    if (currentFilters.type === 'abierta' && question.has_options) {
                        return false;
                    }
                }
                
                // Filtrar por búsqueda
                if (currentSearch) {
                    const searchText = currentSearch.toLowerCase();
                    const questionText = question.question.toLowerCase();
                    const answerText = (question.answer || question.correct_answer || '').toLowerCase();
                    const solutionText = (question.solution || '').toLowerCase();
                    
                    if (!questionText.includes(searchText) && 
                        !answerText.includes(searchText) && 
                        !solutionText.includes(searchText)) {
                        return false;
                    }
                }
                
                return true;
            });
            
            // Actualizar contadores
            updateSidebarStats();
            
            // Mostrar/ocultar estados vacíos
            const container = document.getElementById('questionsList');
            const noQuestionsMsg = document.getElementById('noQuestionsMessage');
            const noSearchResults = document.getElementById('noSearchResults');
            const pagination = document.getElementById('pagination');
            
            if (filteredQuestions.length === 0) {
                container.style.display = 'none';
                pagination.style.display = 'none';
                
                if (currentSearch || 
                    currentFilters.subject !== 'todos' || 
                    currentFilters.topic !== 'todos' || 
                    currentFilters.university !== 'todos' || 
                    currentFilters.type !== 'todos') {
                    noSearchResults.style.display = 'block';
                    noQuestionsMsg.style.display = 'none';
                } else {
                    noQuestionsMsg.style.display = 'block';
                    noSearchResults.style.display = 'none';
                }
                return;
            }
            
            container.style.display = 'grid';
            noQuestionsMsg.style.display = 'none';
            noSearchResults.style.display = 'none';
            
            // Calcular paginación
            const totalPages = Math.ceil(filteredQuestions.length / itemsPerPage);
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const pageQuestions = filteredQuestions.slice(startIndex, endIndex);
            
            // Mostrar preguntas
            container.innerHTML = '';
            pageQuestions.forEach(question => {
                const questionCard = createQuestionCard(question);
                container.appendChild(questionCard);
            });
            
            // Actualizar MathJax
            if (window.MathJax) {
                MathJax.typesetPromise()
                    .catch(err => console.log('MathJax error:', err));
            }
            
            // Actualizar paginación
            if (totalPages > 1) {
                pagination.style.display = 'flex';
                document.getElementById('prevPageBtn').disabled = currentPage === 1;
                document.getElementById('nextPageBtn').disabled = currentPage === totalPages;
                document.getElementById('pageInfo').textContent = 
                    `Página ${currentPage} de ${totalPages} (${filteredQuestions.length} preguntas)`;
            } else {
                pagination.style.display = 'none';
            }
        }
        
function createQuestionCard(question) {
    const card = document.createElement('div');
    card.className = 'question-card';
    
    // Truncar texto largo
    const questionText = question.question.length > 200 ? 
        question.question.substring(0, 200) + '...' : question.question;
    
    const isLong = question.question.length > 200;
    
    // Crear HTML para imagen si existe - FORMATO UNIFICADO
    let imageHTML = '';
    if (question.image && question.image.trim() !== '') {
        const imageUrl = `/static/img/${question.image}`;
        imageHTML = `
            <div class="question-image-preview" style="margin: 10px 0; text-align: center;">
                <img src="${imageUrl}" 
                     alt="Imagen de la pregunta" 
                     class="preview-image"
                     onclick="expandQuestionImage('${imageUrl}')"
                     style="max-width: 100%; max-height: 150px; border-radius: 6px; cursor: pointer; border: 1px solid #ddd;">
                <div class="image-caption" style="font-size: 0.8rem; color: #666; margin-top: 5px;">
                    <i class="fas fa-image"></i> Contiene imagen
                </div>
            </div>
        `;
    }
    
    card.innerHTML = `
        <div class="question-header">
            <div class="question-badges">
                <span class="badge badge-subject">${question.subject}</span>
                <span class="badge badge-topic">${question.topic}</span>
                <span class="badge badge-university">${question.university || 'N/A'}</span>
                ${question.has_options ? 
                    '<span style="background: rgba(59, 130, 246, 0.15); color: #3b82f6; padding: 3px 8px; border-radius: 12px; font-size: 0.7rem;">Opciones</span>' : 
                    '<span style="background: rgba(16, 185, 129, 0.15); color: var(--primary); padding: 3px 8px; border-radius: 12px; font-size: 0.7rem;">Abierta</span>'}
                ${question.image ? 
                    '<span style="background: rgba(168, 85, 247, 0.15); color: #a855f7; padding: 3px 8px; border-radius: 12px; font-size: 0.7rem;"><i class="fas fa-image"></i></span>' : 
                    ''}
            </div>
        </div>
        
        <div class="question-content ${isLong ? '' : 'expanded'}">
            ${questionText}
            ${isLong ? '<span class="read-more" onclick="toggleQuestionText(this)">[leer más]</span>' : ''}
        </div>
        
        ${imageHTML}
        
        <div class="question-actions">
            <button class="btn btn-warning btn-sm" onclick="editQuestion('${question._id}')">
                <i class="fas fa-edit"></i> Editar
            </button>
            <button class="btn btn-danger btn-sm" onclick="confirmDelete('${question._id}')">
                <i class="fas fa-trash"></i> Eliminar
            </button>
            <button class="btn btn-outline btn-sm" onclick="previewQuestion('${question._id}')">
                <i class="fas fa-eye"></i> Vista previa
            </button>
        </div>
        
        <div class="question-stats">
            <span><i class="fas fa-eye"></i> ${question.times_shown || 0} vistas</span>
            <span><i class="fas fa-check-circle"></i> ${question.times_correct || 0} correctas</span>
            <span><i class="fas fa-calendar"></i> ${formatDate(question.created_at)}</span>
        </div>
    `;
    
    return card;
}


// Agregar esta función en la sección de funciones auxiliares

        
        function toggleQuestionText(element) {
            const content = element.closest('.question-content');
            const isExpanded = content.classList.contains('expanded');
            
            if (isExpanded) {
                content.classList.remove('expanded');
                element.textContent = '[leer más]';
            } else {
                content.classList.add('expanded');
                element.textContent = '[leer menos]';
            }
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
        
        function prevPage() {
            if (currentPage > 1) {
                currentPage--;
                displayQuestions();
            }
        }
        
        function nextPage() {
            const totalQuestions = getFilteredQuestions().length;
            const totalPages = Math.ceil(totalQuestions / itemsPerPage);
            
            if (currentPage < totalPages) {
                currentPage++;
                displayQuestions();
            }
        }
        
        function getFilteredQuestions() {
            return allQuestions.filter(question => {
                // Aplicar los mismos filtros que en displayQuestions
                if (currentFilters.subject !== 'todos' && question.subject !== currentFilters.subject) {
                    return false;
                }
                if (currentFilters.topic !== 'todos' && question.topic !== currentFilters.topic) {
                    return false;
                }
                if (currentFilters.university !== 'todos' && question.university !== currentFilters.university) {
                    return false;
                }
                if (currentFilters.type !== 'todos') {
                    if (currentFilters.type === 'opciones' && !question.has_options) return false;
                    if (currentFilters.type === 'abierta' && question.has_options) return false;
                }
                if (currentSearch) {
                    const searchText = currentSearch.toLowerCase();
                    const questionText = question.question.toLowerCase();
                    const answerText = (question.answer || question.correct_answer || '').toLowerCase();
                    
                    if (!questionText.includes(searchText) && !answerText.includes(searchText)) {
                        return false;
                    }
                }
                return true;
            });
        }
        
        function loadQuestionsPage() {
            displayQuestions();
        }
        
        async function loadStatsPage() {
            try {
                const response = await fetch('/api/stats');
                const data = await response.json();
                
                if (data.success) {
                    const stats = data.stats;
                    
                    // Distribución por materias
                    const subjectsChart = document.getElementById('subjectsChart');
                    subjectsChart.innerHTML = createBarChart(stats.subjects, 'subject');
                    
                    // Distribución por universidad
                    const universitiesChart = document.getElementById('universitiesChart');
                    universitiesChart.innerHTML = createBarChart(stats.universities, 'university');
                    
                    // Temas populares
                    const topicsList = document.getElementById('topTopicsList');
                    topicsList.innerHTML = createTopicsList(stats.top_topics);
                    
                    // Rendimiento
                    const performanceStats = document.getElementById('performanceStats');
                    performanceStats.innerHTML = createPerformanceStats(stats);
                    
                    // Preguntas más vistas
                    const mostViewed = document.getElementById('mostViewedQuestions');
                    mostViewed.innerHTML = createMostViewedList(allQuestions);
                }
            } catch (error) {
                console.error('Error cargando estadísticas:', error);
                showNotification('Error al cargar estadísticas', 'error');
            }
        }
        
        function createBarChart(data, type) {
            if (!data || data.length === 0) {
                return '<p style="text-align: center; color: var(--text-muted);">No hay datos disponibles</p>';
            }
            
            const maxCount = Math.max(...data.map(item => item.count));
            let html = '';
            
            data.forEach(item => {
                const percentage = maxCount > 0 ? (item.count / maxCount * 100) : 0;
                const color = type === 'subject' ? 'var(--primary)' : 'var(--accent)';
                
                html += `
                    <div style="margin-bottom: 15px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                            <span style="font-weight: 600;">${item._id}</span>
                            <span>${item.count}</span>
                        </div>
                        <div style="height: 10px; background: var(--bg-elevated); border-radius: 5px; overflow: hidden;">
                            <div style="width: ${percentage}%; height: 100%; background: ${color};"></div>
                        </div>
                    </div>
                `;
            });
            
            return html;
        }
        
        function createTopicsList(topics) {
            if (!topics || topics.length === 0) {
                return '<p style="text-align: center; color: var(--text-muted);">No hay temas disponibles</p>';
            }
            
            let html = '';
            topics.forEach((topic, index) => {
                html += `
                    <div style="margin-bottom: 10px; padding: 10px; background: var(--bg-elevated); border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <span style="font-weight: 700; color: var(--text-primary);">#${index + 1}</span>
                                <span style="margin-left: 10px; font-weight: 600;">${topic._id}</span>
                            </div>
                            <span style="color: var(--primary); font-weight: bold;">${topic.count}</span>
                        </div>
                    </div>
                `;
            });
            
            return html;
        }
        
        function createPerformanceStats(stats) {
            const totalShown = stats.total_shown || 0;
            const totalCorrect = allQuestions.reduce((sum, q) => sum + (q.times_correct || 0), 0);
            const accuracy = totalShown > 0 ? ((totalCorrect / totalShown) * 100).toFixed(1) : 0;
            
            return `
                <div style="text-align: center;">
                    <div style="font-size: 2.5rem; font-weight: 700; color: var(--success); margin-bottom: 10px;">
                        ${accuracy}%
                    </div>
                    <div style="color: var(--text-muted); font-size: 0.9rem;">
                        Precisión global
                    </div>
                    <div style="margin-top: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div>
                            <div style="font-size: 1.2rem; font-weight: 700; color: var(--text-primary);">${totalShown}</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">Total respuestas</div>
                        </div>
                        <div>
                            <div style="font-size: 1.2rem; font-weight: 700; color: var(--success);">${totalCorrect}</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">Correctas</div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        function createMostViewedList(questions) {
            // Ordenar por veces mostradas
            const sortedQuestions = [...questions]
                .sort((a, b) => (b.times_shown || 0) - (a.times_shown || 0))
                .slice(0, 5);
            
            if (sortedQuestions.length === 0) {
                return '<p style="text-align: center; color: var(--text-muted);">No hay preguntas vistas</p>';
            }
            
            let html = '';
            sortedQuestions.forEach((question, index) => {
                const preview = question.question.length > 50 ? 
                    question.question.substring(0, 50) + '...' : question.question;
                
                html += `
                    <div style="margin-bottom: 15px; padding: 12px; background: var(--bg-elevated); border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                                    <span style="font-weight: 700; color: var(--text-primary);">#${index + 1}</span>
                                    <span style="font-size: 0.8rem; background: rgba(16, 185, 129, 0.15); color: var(--primary); padding: 2px 8px; border-radius: 12px;">
                                        ${question.subject}
                                    </span>
                                </div>
                                <div style="font-size: 0.9rem; color: var(--text-primary); margin-bottom: 5px;">
                                    ${preview}
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 1.2rem; font-weight: 700; color: var(--primary);">
                                    ${question.times_shown || 0}
                                </div>
                                <div style="font-size: 0.7rem; color: var(--text-muted);">veces vista</div>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            return html;
        }
        
        function loadStudyPage() {
            loadStudySubjects();
        }

        async function loadSimulatorsPage() {
            try {
                const response = await fetch('/api/simulators');
                const data = await response.json();
                
                if (data.success) {
                    renderSimulatorsAdmin(data.simulators || []);
                    updateSimulatorNameLists(data.simulators || []);
                } else {
                    showNotification('Error al cargar simuladores', 'error');
                }
            } catch (error) {
                console.error('Error cargando simuladores:', error);
                showNotification('Error de conexiÃ³n', 'error');
            }
        }

        async function loadResultsPage() {
            const container = document.getElementById('resultsListsAdmin');
            if (container) {
                container.innerHTML = '<div class="empty-state">Cargando resultados...</div>';
            }

            try {
                const response = await fetch('/api/simulators');
                const data = await response.json();
                if (!data.success) {
                    if (container) {
                        container.innerHTML = '<div class="empty-state">No se pudieron cargar los simuladores.</div>';
                    }
                    showNotification(data.error || 'Error al cargar simuladores', 'error');
                    return;
                }

                const simulators = Array.isArray(data.simulators) ? data.simulators : [];
                if (simulators.length === 0) {
                    if (container) {
                        container.innerHTML = '<div class="empty-state">No hay simuladores registrados.</div>';
                    }
                    return;
                }

                const sorted = [...simulators].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
                const resultEntries = await Promise.all(sorted.map(async (sim) => {
                    const name = String(sim.name || '').trim();
                    if (!name) {
                        return {
                            simulator: '',
                            sections: [],
                            results: [],
                            error: 'Nombre de simulador invalido'
                        };
                    }
                    try {
                        const res = await fetch(`/api/simulators/${encodeURIComponent(name)}/results`);
                        const payload = await res.json();
                        if (!payload.success) {
                            return {
                                simulator: name,
                                sections: [],
                                results: [],
                                error: payload.error || 'No se pudieron cargar resultados'
                            };
                        }
                        return {
                            simulator: payload.simulator || name,
                            sections: Array.isArray(payload.sections) ? payload.sections : [],
                            results: Array.isArray(payload.results) ? payload.results : []
                        };
                    } catch (error) {
                        console.error(`Error cargando resultados para ${name}:`, error);
                        return {
                            simulator: name,
                            sections: [],
                            results: [],
                            error: 'Error de conexion'
                        };
                    }
                }));

                adminResultsCache = resultEntries;
                renderResultsListsAdmin(resultEntries);
            } catch (error) {
                console.error('Error cargando resultados de simuladores:', error);
                if (container) {
                    container.innerHTML = '<div class="empty-state">Error de conexion al cargar resultados.</div>';
                }
                showNotification('Error de conexion', 'error');
            }
        }

        function renderResultsListsAdmin(entries) {
            const container = document.getElementById('resultsListsAdmin');
            if (!container) return;

            if (!Array.isArray(entries) || entries.length === 0) {
                container.innerHTML = '<div class="empty-state">No hay resultados para mostrar.</div>';
                return;
            }

            container.innerHTML = entries.map((entry, idx) => {
                const simulatorName = escapeHtml(entry.simulator || 'Simulador');
                const rows = Array.isArray(entry.results) ? entry.results : [];
                const badgeText = `${rows.length} alumno(s)`;
                return `
                    <button type="button" class="results-admin-card-btn" data-action="open-results-modal" data-index="${idx}">
                        <div class="results-admin-summary">
                            <div class="results-admin-summary-main">
                                <h3>${simulatorName}</h3>
                                <div class="results-admin-meta ${entry.error ? 'error' : ''}">${entry.error ? 'Error al cargar resultados' : badgeText}</div>
                            </div>
                        </div>
                    </button>
                `;
            }).join('');
        }

        function handleResultsListClick(e) {
            const openBtn = e.target.closest('button[data-action="open-results-modal"]');
            if (!openBtn) return;
            const idx = parseInt(openBtn.dataset.index || '-1', 10);
            if (Number.isNaN(idx) || idx < 0) return;
            openResultsAdminModal(idx);
        }

        function openResultsAdminModal(index) {
            const modal = document.getElementById('resultsAdminModal');
            const title = document.getElementById('resultsAdminModalTitle');
            const badge = document.getElementById('resultsAdminModalBadge');
            const wrap = document.getElementById('resultsAdminModalTableWrap');
            if (!modal || !title || !badge || !wrap) return;

            const entry = adminResultsCache[index];
            if (!entry) return;

            const simulatorName = escapeHtml(entry.simulator || 'Simulador');
            title.innerHTML = `<i class="fas fa-table"></i> ${simulatorName}`;

            if (entry.error) {
                badge.textContent = 'Error';
                badge.classList.add('error');
                wrap.innerHTML = `<div class="empty-state">${escapeHtml(entry.error)}</div>`;
                modal.classList.add('active');
                return;
            }

            const rows = Array.isArray(entry.results) ? entry.results : [];
            const sections = Array.isArray(entry.sections) ? entry.sections : [];
            badge.textContent = `${rows.length} alumno(s)`;
            badge.classList.remove('error');

            if (rows.length === 0) {
                wrap.innerHTML = '<div class="empty-state">Aun no hay intentos registrados en este simulador.</div>';
                modal.classList.add('active');
                return;
            }

            const headers = ['#', 'Alumno', 'Grupo', ...sections, 'Total', 'Finalizo'];
            const thead = `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
            const tbody = rows.map(row => {
                const sectionCells = sections.map(section => {
                    const stats = row.section_scores && row.section_scores[section]
                        ? row.section_scores[section]
                        : { correct: 0, total: 0 };
                    return `<td>${parseInt(stats.correct || 0, 10)}/${parseInt(stats.total || 0, 10)}</td>`;
                }).join('');
                return `
                    <tr>
                        <td>${parseInt(row.position || 0, 10) || '-'}</td>
                        <td>${escapeHtml(row.student_name || 'Alumno')}</td>
                        <td>${escapeHtml(row.student_group || '-')}</td>
                        ${sectionCells}
                        <td>${parseInt(row.correct || 0, 10)}/${parseInt(row.total || 0, 10)}</td>
                        <td>${row.finished_at ? formatDateTimeLocal(row.finished_at) : '-'}</td>
                    </tr>
                `;
            }).join('');

            wrap.innerHTML = `
                <table class="results-admin-table">
                    ${thead}
                    <tbody>${tbody}</tbody>
                </table>
            `;
            modal.classList.add('active');
        }

        function closeResultsAdminModal() {
            const modal = document.getElementById('resultsAdminModal');
            if (modal) modal.classList.remove('active');
        }

        async function loadStudentsPage() {
            let url = '/api/students';
            if (currentStudentGroup && currentStudentGroup !== 'todos') {
                url += `?group=${encodeURIComponent(currentStudentGroup)}`;
            }

            try {
                const response = await fetch(url);
                const data = await response.json();
                if (!data.success) {
                    showNotification(data.error || 'Error al cargar alumnos', 'error');
                    return;
                }

                allStudents = data.students || [];
                studentGroupsSummary = data.groups_summary || [];
                renderStudentGroupButtons(studentGroupsSummary);
                renderStudents();
            } catch (error) {
                console.error('Error cargando alumnos:', error);
                showNotification('Error de conexión al cargar alumnos', 'error');
            }
        }

        function renderStudentGroupButtons(groupsSummary) {
            const container = document.getElementById('studentGroupsButtons');
            if (!container) return;
            container.innerHTML = '';

            const allBtn = document.createElement('div');
            allBtn.className = currentStudentGroup === 'todos' ? 'subject-card active' : 'subject-card';
            allBtn.innerHTML = `
                <div class="subject-icon"><i class="fas fa-users"></i></div>
                <div class="subject-name">Todos</div>
            `;
            allBtn.addEventListener('click', function() {
                if (currentStudentGroup === 'todos') return;
                currentStudentGroup = 'todos';
                loadStudentsPage();
            });
            container.appendChild(allBtn);

            groupsSummary.forEach(item => {
                const group = item.name;
                const count = item.count || 0;
                const card = document.createElement('div');
                card.className = currentStudentGroup === group ? 'group-card active' : 'group-card';
                card.innerHTML = `
                    <div class="group-card-main">
                        <div class="group-card-title">${group}</div>
                        <div class="group-card-count">${count} alumnos</div>
                    </div>
                    <div class="group-actions">
                        <button type="button" class="group-actions-toggle" title="Acciones">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <div class="group-actions-menu">
                            <button type="button" data-action="edit">Editar</button>
                            <button type="button" data-action="delete">Eliminar</button>
                        </div>
                    </div>
                `;

                card.addEventListener('click', function(e) {
                    if (e.target.closest('.group-actions')) return;
                    if (currentStudentGroup === group) return;
                    currentStudentGroup = group;
                    loadStudentsPage();
                });

                const toggle = card.querySelector('.group-actions-toggle');
                const menu = card.querySelector('.group-actions-menu');
                if (toggle && menu) {
                    toggle.addEventListener('click', function(e) {
                        e.stopPropagation();
                        document.querySelectorAll('.group-actions-menu.open').forEach(m => {
                            if (m !== menu) m.classList.remove('open');
                        });
                        menu.classList.toggle('open');
                    });
                    menu.addEventListener('click', async function(e) {
                        e.stopPropagation();
                        const actionBtn = e.target.closest('button[data-action]');
                        if (!actionBtn) return;
                        const action = actionBtn.dataset.action;
                        menu.classList.remove('open');
                        if (action === 'edit') {
                            await renameStudentGroup(group);
                        } else if (action === 'delete') {
                            await deleteStudentGroup(group);
                        }
                    });
                }

                container.appendChild(card);
            });

            const validGroups = groupsSummary.map(item => item.name);
            if (currentStudentGroup !== 'todos' && !validGroups.includes(currentStudentGroup)) {
                currentStudentGroup = 'todos';
            }
        }

        async function renameStudentGroup(group) {
            const newGroup = prompt(`Nuevo nombre para el grupo "${group}":`, group);
            if (!newGroup) return;
            const trimmed = newGroup.trim();
            if (!trimmed || trimmed === group) return;

            try {
                const response = await fetch(`/api/students/groups/${encodeURIComponent(group)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ new_group: trimmed })
                });
                const data = await response.json();
                if (data.success) {
                    if (currentStudentGroup === group) currentStudentGroup = trimmed;
                    showNotification('Grupo actualizado', 'success');
                    loadStudentsPage();
                } else {
                    showNotification(data.error || 'Error al editar grupo', 'error');
                }
            } catch (error) {
                console.error('Error editando grupo:', error);
                showNotification('Error de conexión', 'error');
            }
        }

        async function deleteStudentGroup(group) {
            openGroupDeleteModal(group);
        }

        function renderStudents() {
            const container = document.getElementById('studentsList');
            const emptyState = document.getElementById('noStudentsMessage');
            if (!container || !emptyState) return;

            container.innerHTML = '';
            if (!allStudents.length) {
                emptyState.style.display = 'block';
                return;
            }

            emptyState.style.display = 'none';
            allStudents.forEach(student => {
                const card = document.createElement('div');
                card.className = 'question-card';
                const fullName = `${student.nombre || ''} ${student.apellido || ''}`.trim();
                card.innerHTML = `
                    <div class="question-header">
                        <div class="question-badges">
                            <span class="badge badge-subject">${student.grupo || 'Sin grupo'}</span>
                            <span class="badge badge-topic">Alumno</span>
                        </div>
                    </div>
                    <div style="margin-top: 8px;">
                        <div style="font-weight: 700; color: var(--text-primary);">${fullName || 'Sin nombre'}</div>
                        <div style="color: var(--text-secondary); font-size: 0.92rem; margin-top: 6px;">
                            <i class="fas fa-envelope"></i> ${student.email || 'Sin correo'}
                        </div>
                        <div style="color: var(--text-muted); font-size: 0.82rem; margin-top: 8px;">
                            <i class="fas fa-calendar"></i> Registro: ${formatDate(student.created_at)}
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });
        }

        function updateSimulatorNameLists(simulators) {
            const names = (simulators || [])
                .map(sim => sim && sim.name ? String(sim.name) : '')
                .filter(name => name);

            const modalList = document.getElementById('modalSimulatorList');
            const bulkList = document.getElementById('bulkSimulatorList');

            setDatalistOptions(modalList, names);
            setDatalistOptions(bulkList, names);
        }

        function setDatalistOptions(listEl, values) {
            if (!listEl) return;
            listEl.innerHTML = '';
            values.forEach(value => {
                const option = document.createElement('option');
                option.value = value;
                listEl.appendChild(option);
            });
        }

        async function loadSimulatorNameOptions() {
            try {
                const response = await fetch('/api/simulators');
                const data = await response.json();
                if (data.success) {
                    updateSimulatorNameLists(data.simulators || []);
                }
            } catch (error) {
                console.error('Error cargando simuladores:', error);
            }
        }

        function openSimulatorCreateModal() {
            const modal = document.getElementById('simulatorCreateModal');
            const nameInput = document.getElementById('newSimulatorName');
            if (!modal) return;
            modal.classList.add('active');
            if (nameInput) {
                nameInput.focus();
            }
        }

        function closeSimulatorCreateModal() {
            const modal = document.getElementById('simulatorCreateModal');
            if (!modal) return;
            modal.classList.remove('active');
        }

        function openSimulatorEditModal(simData) {
            const modal = document.getElementById('simulatorEditModal');
            const originalNameEl = document.getElementById('editSimulatorOriginalName');
            const nameEl = document.getElementById('editSimulatorName');
            const timeEl = document.getElementById('editSimulatorTime');
            const fromEl = document.getElementById('editSimulatorEnabledFrom');
            const untilEl = document.getElementById('editSimulatorEnabledUntil');
            if (!modal || !originalNameEl || !nameEl || !timeEl || !fromEl || !untilEl) return;

            originalNameEl.value = simData.name || '';
            nameEl.value = simData.name || '';
            timeEl.value = simData.time_limit || 30;
            fromEl.value = toDateTimeLocalValue(simData.enabled_from);
            untilEl.value = toDateTimeLocalValue(simData.enabled_until);
            modal.classList.add('active');
            nameEl.focus();
        }

        function closeSimulatorEditModal() {
            const modal = document.getElementById('simulatorEditModal');
            if (!modal) return;
            modal.classList.remove('active');
        }

        function toDateTimeLocalValue(value) {
            if (!value) return '';
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return '';
            const pad = (n) => String(n).padStart(2, '0');
            const year = date.getFullYear();
            const month = pad(date.getMonth() + 1);
            const day = pad(date.getDate());
            const hours = pad(date.getHours());
            const minutes = pad(date.getMinutes());
            return `${year}-${month}-${day}T${hours}:${minutes}`;
        }

        function formatDateTimeLocal(value) {
            if (!value) return 'Sin límite';
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return 'Sin límite';
            const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
            const day = date.getDate();
            const month = months[date.getMonth()];
            let hour = date.getHours();
            const suffix = hour >= 12 ? 'pm' : 'am';
            hour = hour % 12 || 12;
            const minute = String(date.getMinutes()).padStart(2, '0');
            return `${day}/${month} ${hour}:${minute} ${suffix}`;
        }

        function escapeHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function renderSimulatorsAdmin(simulators) {
            const container = document.getElementById('simulatorListAdmin');
            if (!container) return;
            
            if (!simulators || simulators.length === 0) {
                container.innerHTML = '<div class="empty-state">No hay simuladores</div>';
                return;
            }
            
            container.innerHTML = simulators.map(sim => `
                <div
                    class="simulator-admin-card"
                    data-name="${escapeHtml(sim.name)}"
                    data-time-limit="${sim.time_limit || 30}"
                    data-enabled-from="${escapeHtml(sim.enabled_from || '')}"
                    data-enabled-until="${escapeHtml(sim.enabled_until || '')}"
                    data-force-enabled="${sim.force_enabled ? '1' : '0'}"
                >
                    <div class="simulator-admin-header">
                        <div>
                            <div class="simulator-admin-title">${escapeHtml(sim.name)}</div>
                            <div class="simulator-admin-meta">
                                <span class="simulator-status ${sim.is_open ? 'open' : 'closed'}">${sim.is_open ? 'Habilitado' : 'Deshabilitado'}</span>
                            </div>
                            <div class="simulator-admin-meta">
                                Desde: ${formatDateTimeLocal(sim.enabled_from)} | Hasta: ${formatDateTimeLocal(sim.enabled_until)}
                            </div>
                        </div>
                        <div class="simulator-admin-actions">
                            <button class="btn btn-outline btn-sm" data-action="attendance-sim">Control</button>
                            <button class="btn btn-outline btn-sm" data-action="toggle-force">${sim.force_enabled ? 'Usar fechas' : 'Habilitar ahora'}</button>
                            <div class="simulator-actions">
                                <button type="button" class="simulator-actions-toggle" data-action="toggle-sim-menu" title="Acciones">
                                    <i class="fas fa-ellipsis-v"></i>
                                </button>
                                <div class="simulator-actions-menu">
                                    <button type="button" data-action="edit-sim">
                                        <i class="fas fa-pen"></i> Editar
                                    </button>
                                    <button type="button" data-action="delete-sim">
                                        <i class="fas fa-trash"></i> Eliminar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
        }

        async function createSimulator() {
            const nameInput = document.getElementById('newSimulatorName');
            const timeInput = document.getElementById('newSimulatorTime');
            const enabledFromInput = document.getElementById('newSimulatorEnabledFrom');
            const enabledUntilInput = document.getElementById('newSimulatorEnabledUntil');
            if (!nameInput || !timeInput) return;
            
            const name = nameInput.value.trim();
            const timeLimit = parseInt(timeInput.value, 10);
            const enabledFrom = enabledFromInput ? enabledFromInput.value : '';
            const enabledUntil = enabledUntilInput ? enabledUntilInput.value : '';
            
            if (!name) {
                openSimulatorCreateModal();
                showNotification('Escribe el nombre del simulador', 'error');
                return;
            }
            
            try {
                const response = await fetch('/api/simulators', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        name,
                        time_limit: timeLimit,
                        enabled_from: enabledFrom,
                        enabled_until: enabledUntil
                    })
                });
                const data = await response.json();
                
                if (data.success) {
                    showNotification('Simulador guardado', 'success');
                    nameInput.value = '';
                    if (enabledFromInput) enabledFromInput.value = '';
                    if (enabledUntilInput) enabledUntilInput.value = '';
                    closeSimulatorCreateModal();
                    await loadSimulatorsPage();
                } else {
                    showNotification(data.error || 'Error al guardar simulador', 'error');
                }
            } catch (error) {
                console.error('Error guardando simulador:', error);
                showNotification('Error de conexiÃ³n', 'error');
            }
        }

        async function handleSimulatorListClick(e) {
            const editBtn = e.target.closest('button[data-action="edit-sim"]');
            const deleteBtn = e.target.closest('button[data-action="delete-sim"]');
            const toggleForceBtn = e.target.closest('button[data-action="toggle-force"]');
            const attendanceBtn = e.target.closest('button[data-action="attendance-sim"]');
            const toggleMenuBtn = e.target.closest('button[data-action="toggle-sim-menu"]');
            if (!editBtn && !deleteBtn && !toggleForceBtn && !toggleMenuBtn && !attendanceBtn) return;
            
            const card = e.target.closest('.simulator-admin-card');
            if (!card) return;

            if (toggleMenuBtn) {
                const menu = card.querySelector('.simulator-actions-menu');
                if (!menu) return;
                document.querySelectorAll('.simulator-actions-menu.open').forEach(m => {
                    if (m !== menu) m.classList.remove('open');
                });
                menu.classList.toggle('open');
                return;
            }
            
            const name = card.dataset.name;
            const isForceEnabled = card.dataset.forceEnabled === '1';

            if (attendanceBtn) {
                openSimulatorAttendanceModal(name);
                return;
            }

            if (toggleForceBtn) {
                const nextForceEnabled = !isForceEnabled;
                try {
                    const response = await fetch(`/api/simulators/${encodeURIComponent(name)}/force-enable`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ force_enabled: nextForceEnabled })
                    });
                    const data = await response.json();
                    if (data.success) {
                        showNotification(nextForceEnabled ? 'Simulador habilitado manualmente' : 'Simulador volvió a usar fechas', 'success');
                        await loadSimulatorsPage();
                    } else {
                        showNotification(data.error || 'Error al actualizar estado', 'error');
                    }
                } catch (error) {
                    console.error('Error cambiando estado forzado:', error);
                    showNotification('Error de conexión', 'error');
                }
                return;
            }

            if (deleteBtn) {
                const actionsMenu = card.querySelector('.simulator-actions-menu');
                if (actionsMenu) actionsMenu.classList.remove('open');
                if (!confirm(`¿Eliminar simulador "${name}"? Esto borrará sus preguntas.`)) return;
                try {
                    const response = await fetch(`/api/simulators/${encodeURIComponent(name)}`, {
                        method: 'DELETE'
                    });
                    const data = await response.json();
                    if (data.success) {
                        showNotification('Simulador eliminado', 'success');
                        await loadSimulatorsPage();
                    } else {
                        showNotification(data.error || 'Error al eliminar', 'error');
                    }
                } catch (error) {
                    console.error('Error eliminando simulador:', error);
                    showNotification('Error de conexión', 'error');
                }
                return;
            }

            if (editBtn) {
                const actionsMenu = card.querySelector('.simulator-actions-menu');
                if (actionsMenu) actionsMenu.classList.remove('open');
                openSimulatorEditModal({
                    name: card.dataset.name || '',
                    time_limit: parseInt(card.dataset.timeLimit || '30', 10),
                    enabled_from: card.dataset.enabledFrom || '',
                    enabled_until: card.dataset.enabledUntil || ''
                });
            }
        }

        function openSimulatorAttendanceModal(simulatorName) {
            const modal = document.getElementById('simulatorAttendanceModal');
            const input = document.getElementById('attendanceSimulatorName');
            if (!modal || !input) return;
            input.value = simulatorName || '';
            modal.classList.add('active');
            loadSimulatorAttendance(simulatorName);
        }

        function closeSimulatorAttendanceModal() {
            const modal = document.getElementById('simulatorAttendanceModal');
            if (!modal) return;
            modal.classList.remove('active');
        }

        async function loadSimulatorAttendance(simulatorName) {
            const body = document.getElementById('simulatorAttendanceBody');
            const summary = document.getElementById('attendanceSummary');
            const groupFilter = document.getElementById('attendanceGroupFilter');
            if (!body || !summary || !groupFilter || !simulatorName) return;

            const selectedGroup = (groupFilter.value || 'todos').trim();
            const params = selectedGroup && selectedGroup !== 'todos' ? `?group=${encodeURIComponent(selectedGroup)}` : '';

            body.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">Cargando...</td></tr>';
            try {
                const response = await fetch(`/api/simulators/${encodeURIComponent(simulatorName)}/attendance${params}`);
                const data = await response.json();
                if (!data.success) {
                    body.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--danger);">${escapeHtml(data.error || 'Error al cargar')}</td></tr>`;
                    return;
                }

                const currentValue = groupFilter.value || 'todos';
                const groups = Array.isArray(data.groups) ? data.groups : [];
                groupFilter.innerHTML = '<option value="todos">Todos los grupos</option>';
                groups.forEach(group => {
                    const option = document.createElement('option');
                    option.value = group.name;
                    option.textContent = `${group.name} (${group.count || 0})`;
                    groupFilter.appendChild(option);
                });
                if ([...groupFilter.options].some(opt => opt.value === currentValue)) {
                    groupFilter.value = currentValue;
                }

                summary.textContent = `Completados: ${data.completed_students || 0} | Pendientes: ${data.pending_students || 0} | Total: ${data.total_students || 0}`;

                const rows = Array.isArray(data.rows) ? data.rows : [];
                if (rows.length === 0) {
                    body.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">No hay alumnos para este filtro</td></tr>';
                    return;
                }

                body.innerHTML = rows.map((row, idx) => {
                    const completed = (row.status || '').toLowerCase() === 'completado';
                    return `
                        <tr>
                            <td>${idx + 1}</td>
                            <td>${escapeHtml(row.name || 'Alumno')}</td>
                            <td>${escapeHtml(row.group || '-')}</td>
                            <td><span class="attendance-status ${completed ? 'completed' : 'pending'}">${completed ? 'Completado' : 'Pendiente'}</span></td>
                            <td>${escapeHtml(row.score || '-')}</td>
                            <td>${row.finished_at ? formatDateTimeLocal(row.finished_at) : '-'}</td>
                        </tr>
                    `;
                }).join('');
            } catch (error) {
                console.error('Error cargando asistencia de simulador:', error);
                body.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--danger);">Error de conexión</td></tr>';
            }
        }

        async function saveSimulatorEdit() {
            const originalNameEl = document.getElementById('editSimulatorOriginalName');
            const nameEl = document.getElementById('editSimulatorName');
            const timeEl = document.getElementById('editSimulatorTime');
            const fromEl = document.getElementById('editSimulatorEnabledFrom');
            const untilEl = document.getElementById('editSimulatorEnabledUntil');
            if (!originalNameEl || !nameEl || !timeEl || !fromEl || !untilEl) return;

            const originalName = (originalNameEl.value || '').trim();
            const newName = (nameEl.value || '').trim();
            const timeLimit = parseInt(timeEl.value, 10);
            const enabledFrom = fromEl.value || '';
            const enabledUntil = untilEl.value || '';

            if (!originalName || !newName) {
                showNotification('Escribe el nombre del simulador', 'error');
                return;
            }

            try {
                const response = await fetch(`/api/simulators/${encodeURIComponent(originalName)}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        time_limit: timeLimit,
                        new_name: newName,
                        enabled_from: enabledFrom,
                        enabled_until: enabledUntil
                    })
                });
                const data = await response.json();

                if (data.success) {
                    showNotification('Simulador actualizado', 'success');
                    closeSimulatorEditModal();
                    await loadSimulatorsPage();
                } else {
                    showNotification(data.error || 'Error al actualizar', 'error');
                }
            } catch (error) {
                console.error('Error actualizando simulador:', error);
                showNotification('Error de conexión', 'error');
            }
        }
        
        async function loadStudySubjects() {
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
                
                const response = await fetch(`/api/subjects/${encodeURIComponent(studySelectedSubject)}/topics`);
                const data = await response.json();
                
                if (data.success && data.topics.length > 0) {
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
                    data.topics.forEach(topic => {
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
            if (!studySelectedSubject) {
                showNotification('Primero selecciona una materia', 'warning');
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
    // Actualizar badges
    document.getElementById('modalQuestionSubject').textContent = question.subject;
    document.getElementById('modalQuestionTopic').textContent = question.topic;
    document.getElementById('modalQuestionUniversity').textContent = question.university || 'General';

    const questionTextEl = document.getElementById('modalQuestionText');
    const optionsContainer = document.getElementById('modalOptionsContainer');
    const answerTextEl = document.getElementById('modalAnswerText');
    const solutionTextEl = document.getElementById('modalSolutionText');

    // Ocultar contenido mientras MathJax renderiza
    [questionTextEl, optionsContainer, answerTextEl, solutionTextEl].forEach(el => {
        if (el) el.style.visibility = 'hidden';
    });
    
    // Crear contenido de pregunta
    let questionHTML = question.question;
    
    // Añadir imagen si existe (USANDO EL MISMO FORMATO QUE index.js)
    if (question.image && question.image.trim() !== '') {
        const imageUrl = `/static/img/${question.image}`;
        questionHTML += `
            <div class="question-image-container" style="margin: 15px 0; text-align: center;">
                <img src="${imageUrl}" 
                     alt="Imagen del ejercicio" 
                     class="question-image"
                     onclick="expandQuestionImage('${imageUrl}')"
                     style="max-width: 100%; max-height: 180px; border-radius: 8px; cursor: pointer; transition: transform 0.3s ease;">
            </div>
        `;
    }
    
    questionTextEl.innerHTML = questionHTML;
    
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
    
    // Actualizar respuesta y solución
    answerTextEl.innerHTML = question.answer || question.correct_answer || '';
    
    // Mostrar solución si existe
    const solutionContainer = document.getElementById('solutionContainer');
    if (question.solution && question.solution.trim() !== '') {
        solutionTextEl.innerHTML = question.solution;
        if (solutionContainer) {
            solutionContainer.style.display = 'block';
        }
    } else if (solutionContainer) {
        solutionContainer.style.display = 'none';
    }
    
    // Ocultar respuesta inicialmente
    document.getElementById('modalAnswerSection').style.display = 'none';
    
    // Mostrar modal
    document.getElementById('studyQuestionModal').style.display = 'flex';
    
    // Actualizar MathJax después de un breve retraso
    if (window.MathJax) {
        setTimeout(() => {
            MathJax.typesetPromise()
                .catch(err => console.log('MathJax error:', err))
                .finally(() => {
                    [questionTextEl, optionsContainer, answerTextEl, solutionTextEl].forEach(el => {
                        if (el) el.style.visibility = '';
                    });
                });
        }, 100);
    } else {
        [questionTextEl, optionsContainer, answerTextEl, solutionTextEl].forEach(el => {
            if (el) el.style.visibility = '';
        });
    }
}
        
        function previewQuestion(questionId) {
            const question = allQuestions.find(q => q._id === questionId);
            if (question) {
                displayStudyQuestion(question);
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
        
        // Funciones para el modal de preguntas
        function openModal(questionId = null) {
            if (questionId) {
                editQuestion(questionId);
            } else {
                resetModal();
                document.getElementById('questionModal').classList.add('active');
            }
        }
        
        function closeModal() {
            document.getElementById('questionModal').classList.remove('active');
            resetModal();
        }
        
        function resetModal() {
            isEditMode = false;
            currentEditQuestionId = null;
             currentImageFile = null;
             existingImageUrl = null;
            
            document.getElementById('modalTitle').innerHTML = '<i class="fas fa-plus-circle"></i> Nueva Pregunta';
            document.getElementById('saveQuestionBtn').innerHTML = '<i class="fas fa-save"></i> Guardar Pregunta';
            
            document.getElementById('modalSubject').value = 'Matemáticas';
            document.getElementById('modalNewSubject').style.display = 'none';
            document.getElementById('modalNewSubject').value = '';
            document.getElementById('modalTopic').value = '';
            document.getElementById('modalTopic').disabled = false;
            loadModalTopics('Matemáticas');
            document.getElementById('modalQuestion').value = '';
            document.getElementById('modalAnswer').value = '';
            document.getElementById('modalSolution').value = '';
            document.getElementById('modalUniversity').value = 'UNAM';
            document.getElementById('modalNewUniversity').style.display = 'none';
            document.getElementById('modalNewUniversity').value = '';
            document.getElementById('modalIsSimulator').checked = false;
            document.getElementById('modalSimulatorName').value = '';
            document.getElementById('modalSimulatorName').style.display = 'none';
            document.getElementById('modalSimulatorSection').value = '';
            document.getElementById('modalSimulatorSection').style.display = 'none';
            document.getElementById('simulatorHint').style.display = 'none';
            document.getElementById('modalSubject').disabled = false;
             // Limpiar imagen
            document.getElementById('modalImage').value = '';
            document.getElementById('imagePreviewContainer').style.display = 'none';
            document.getElementById('previewImage').src = '';
            const pix2TextInput = document.getElementById('pix2textImage');
            if (pix2TextInput) pix2TextInput.value = '';
            setPix2TextStatus('Sube una imagen con la fórmula y se insertará en la pregunta como $$...$$');
            
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
            
        }
        
        function editQuestion(questionId) {
            const question = allQuestions.find(q => q._id === questionId);
            if (!question) {
                showNotification('Pregunta no encontrada', 'error');
                return;
            }
            
            isEditMode = true;
            currentEditQuestionId = questionId;
            
            document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> Editar Pregunta';
            document.getElementById('saveQuestionBtn').innerHTML = '<i class="fas fa-save"></i> Actualizar Pregunta';
            
            document.getElementById('modalSubject').value = question.subject;
            document.getElementById('modalTopic').value = question.topic;
            loadModalTopics(question.subject);
            document.getElementById('modalQuestion').value = question.question;
            document.getElementById('modalSolution').value = question.solution || '';
            document.getElementById('modalUniversity').value = question.university || 'UNAM';
            document.getElementById('modalIsSimulator').checked = question.subject === 'Simulador';
            document.getElementById('modalSimulatorName').value = question.subject === 'Simulador' ? question.topic : '';
            document.getElementById('modalSimulatorSection').value = question.simulator_subject || '';
            toggleSimulatorMode();
            
            if (question.has_options && question.options && question.options.length > 0) {
                document.getElementById('hasOptionsCheckbox').checked = true;
                toggleOptions();
                
                document.getElementById('optionA').value = question.options[0] || '';
                document.getElementById('optionB').value = question.options[1] || '';
                document.getElementById('optionC').value = question.options[2] || '';
                document.getElementById('optionD').value = question.options[3] || '';
                
                if (question.correct_option >= 0 && question.correct_option < 4) {
                    const correctRadio = document.getElementById(`correctOption${String.fromCharCode(65 + question.correct_option)}`);
                    if (correctRadio) {
                        correctRadio.checked = true;
                    }
                }
                
                document.getElementById('modalAnswer').value = '';
            } else {
                document.getElementById('hasOptionsCheckbox').checked = false;
                toggleOptions();
                document.getElementById('modalAnswer').value = question.answer || question.correct_answer || '';
            }
            
            document.getElementById('questionModal').classList.add('active');
        }

        // Modificar la función saveQuestion para manejar imágenes
async function saveQuestion() {
    // Obtener valores
    const subject = document.getElementById('modalSubject').value;
    const newSubject = document.getElementById('modalNewSubject').value.trim();
    let finalSubject = subject === '_new_' && newSubject ? newSubject : subject;
    
    let topic = document.getElementById('modalTopic').value.trim();
    const isSimulator = document.getElementById('modalIsSimulator').checked;
    const simulatorName = document.getElementById('modalSimulatorName').value.trim();
    const simulatorSection = (document.getElementById('modalSimulatorSection')?.value || '').trim();
    const questionText = document.getElementById('modalQuestion').value.trim();
    
    const universitySelect = document.getElementById('modalUniversity').value;
    const newUniversity = document.getElementById('modalNewUniversity').value.trim();
    const finalUniversity = universitySelect === '_new_' && newUniversity ? newUniversity : universitySelect;
    
    // Validar
    if (isSimulator) {
        if (!simulatorName) {
            showNotification('El nombre del simulador es requerido', 'error');
            return;
        }
        if (!simulatorSection) {
            showNotification('Selecciona la materia interna del simulador', 'error');
            return;
        }
        finalSubject = 'Simulador';
        topic = simulatorName;
    }
    
    if (!finalSubject || !topic || !questionText) {
        showNotification('Por favor completa todos los campos requeridos', 'error');
        return;
    }
    
    // Crear FormData para enviar archivo
    const formData = new FormData();
    
    // Agregar campos de texto
    formData.append('subject', finalSubject);
    formData.append('topic', topic);
    formData.append('simulator_subject', isSimulator ? simulatorSection : '');
    formData.append('question', questionText);
    formData.append('university', finalUniversity);
    formData.append('solution', document.getElementById('modalSolution').value.trim());
    formData.append('has_options', document.getElementById('hasOptionsCheckbox').checked.toString());
    
    // Agregar imagen si hay una nueva
    if (currentImageFile) {
        formData.append('image', currentImageFile);
    }
    
    // Agregar opciones múltiples o respuesta abierta
    if (document.getElementById('hasOptionsCheckbox').checked) {
        const options = [
            document.getElementById('optionA').value.trim(),
            document.getElementById('optionB').value.trim(),
            document.getElementById('optionC').value.trim(),
            document.getElementById('optionD').value.trim()
        ];
        
        const emptyOptions = options.filter(opt => !opt);
        if (emptyOptions.length > 0) {
            showNotification('Todas las opciones deben tener texto', 'error');
            return;
        }
        
        const correctOptionInput = document.querySelector('input[name="correctOption"]:checked');
        if (!correctOptionInput) {
            showNotification('Debes seleccionar la opción correcta', 'error');
            return;
        }
        
        const correctOptionIndex = parseInt(correctOptionInput.value);
        
        formData.append('options', JSON.stringify(options));
        formData.append('correct_option', correctOptionIndex.toString());
        formData.append('correct_answer', `${String.fromCharCode(65 + correctOptionIndex)}. ${options[correctOptionIndex]}`);
        formData.append('answer', '');
    } else {
        const answer = document.getElementById('modalAnswer').value.trim();
        if (!answer) {
            showNotification('La respuesta es requerida para preguntas abiertas', 'error');
            return;
        }
        
        formData.append('options', JSON.stringify([]));
        formData.append('correct_option', '-1');
        formData.append('correct_answer', answer);
        formData.append('answer', answer);
    }
    
    const saveBtn = document.getElementById('saveQuestionBtn');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner loading"></i> ' + 
        (isEditMode ? 'Actualizando...' : 'Guardando...');
    saveBtn.disabled = true;
    
    try {
        let response;
        let endpoint;
        
        if (isEditMode && currentEditQuestionId) {
            // Para actualizar, necesitamos enviar como JSON normal
            // Ya que PUT con FormData es más complejo
            // Enviar sin imagen por ahora (se puede mejorar)
            const questionData = {
                subject: finalSubject,
                topic: topic,
                simulator_subject: isSimulator ? simulatorSection : '',
                question: questionText,
                university: finalUniversity,
                solution: document.getElementById('modalSolution').value.trim(),
                has_options: document.getElementById('hasOptionsCheckbox').checked,
                // Mantener imagen existente si no se subió nueva
                image: currentImageFile ? undefined : existingImageUrl
            };
            
            if (questionData.has_options) {
                const options = [
                    document.getElementById('optionA').value.trim(),
                    document.getElementById('optionB').value.trim(),
                    document.getElementById('optionC').value.trim(),
                    document.getElementById('optionD').value.trim()
                ];
                const correctOptionIndex = parseInt(document.querySelector('input[name="correctOption"]:checked').value);
                
                questionData.options = options;
                questionData.correct_option = correctOptionIndex;
                questionData.correct_answer = `${String.fromCharCode(65 + correctOptionIndex)}. ${options[correctOptionIndex]}`;
                questionData.answer = '';
            } else {
                questionData.correct_answer = document.getElementById('modalAnswer').value.trim();
                questionData.answer = document.getElementById('modalAnswer').value.trim();
                questionData.options = [];
                questionData.correct_option = -1;
            }
            
            endpoint = `/api/questions/${currentEditQuestionId}`;
            response = await fetch(endpoint, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(questionData)
            });
        } else {
            // Crear nueva pregunta con FormData (incluye imagen)
            endpoint = '/api/questions';
            response = await fetch(endpoint, {
                method: 'POST',
                body: formData
            });
        }
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(
                isEditMode ? '✅ Pregunta actualizada' : '✅ Pregunta guardada', 
                'success'
            );
            closeModal();
            await loadAllData();
        } else {
            showNotification('❌ Error: ' + (data.error || 'Error desconocido'), 'error');
        }
    } catch (error) {
        console.error('Error guardando pregunta:', error);
        showNotification('❌ Error de conexión', 'error');
    } finally {
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

// Inicializar vista previa de imagen
document.addEventListener('DOMContentLoaded', function() {
    setupImagePreview();
});
        



        function confirmDelete(questionId) {
            questionToDelete = questionId;
            document.getElementById('confirmModal').style.display = 'flex';
        }
        
        function closeConfirmModal() {
            questionToDelete = null;
            document.getElementById('confirmModal').style.display = 'none';
        }
        
        async function deleteQuestion() {
            if (!questionToDelete) return;
            
            try {
                const response = await fetch(`/api/questions/${questionToDelete}`, {
                    method: 'DELETE'
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showNotification('✅ Pregunta eliminada', 'success');
                    closeConfirmModal();
                    await loadAllData(); // Recargar datos
                } else {
                    showNotification('❌ Error: ' + data.error, 'error');
                }
            } catch (error) {
                console.error('Error eliminando pregunta:', error);
                showNotification('❌ Error de conexión', 'error');
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
        
        async function logout() {
            try {
                const response = await fetch('/api/logout', {
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
        
        
        
        
         // Funciones para carga masiva (VERSIÓN MEJORADA)
    function openBulkModal() {
        document.getElementById('bulkModal').style.display = 'flex';
        document.getElementById('bulkText').value = '';
        document.getElementById('bulkProgressContainer').style.display = 'none';
        document.getElementById('bulkResultContainer').style.display = 'none';
        document.getElementById('bulkPreview').style.display = 'none';
        
        // Resetear valores
        document.getElementById('bulkSubject').value = 'Matemáticas';
        document.getElementById('bulkNewSubject').style.display = 'none';
        document.getElementById('bulkNewSubject').value = '';
        document.getElementById('bulkTopic').value = '';
        document.getElementById('bulkUniversity').value = 'UNAM';
        document.getElementById('bulkIsSimulator').checked = false;
        document.getElementById('bulkSimulatorName').value = '';
        document.getElementById('bulkSimulatorName').style.display = 'none';
        document.getElementById('bulkSimulatorHint').style.display = 'none';
        document.getElementById('bulkSubject').disabled = false;
        document.getElementById('bulkTopic').disabled = false;
        
        // Inicializar evento para materia personalizada
        document.getElementById('bulkSubject').addEventListener('change', function() {
            const newSubjectInput = document.getElementById('bulkNewSubject');
            if (this.value === '_new_') {
                newSubjectInput.style.display = 'block';
                newSubjectInput.focus();
                loadBulkTopics('');
            } else {
                newSubjectInput.style.display = 'none';
                loadBulkTopics(this.value);
            }
        });

        const bulkSimulatorCheckbox = document.getElementById('bulkIsSimulator');
        if (bulkSimulatorCheckbox) {
            bulkSimulatorCheckbox.addEventListener('change', toggleBulkSimulatorMode);
        }
        
        // Evento para análisis en tiempo real
        document.getElementById('bulkText').addEventListener('input', function() {
            actualizarEstadisticasBulk();
        });
        
        document.getElementById('bulkText').focus();
    }
    
    function closeBulkModal() {
        document.getElementById('bulkModal').style.display = 'none';
    }
    
    function actualizarEstadisticasBulk() {
        const texto = document.getElementById('bulkText').value.trim();
        const statsElement = document.getElementById('bulkStats');
        const previewElement = document.getElementById('bulkPreview');
        
        if (!texto) {
            statsElement.textContent = '0 preguntas detectadas | 0 líneas';
            previewElement.style.display = 'none';
            return;
        }
        
        // Contar líneas
        const lineas = texto.split('\n').length;
        
        // Mejor detección de preguntas: buscar patrón de opciones múltiples
        const lineasArray = texto.split('\n');
        let preguntasDetectadas = 0;
        let encontroOpciones = false;
        let opcionesContador = 0;
        
        for (let i = 0; i < lineasArray.length; i++) {
            const linea = lineasArray[i].trim();
            
            // Detectar líneas con opciones A), B), C), D)
            if (/^[A-D][).]\s+/.test(linea) || /^\([A-D]\)\s+/.test(linea)) {
                opcionesContador++;
                encontroOpciones = true;
            }
            
            // Si hay una línea de respuesta, contar como pregunta completada
            if (encontroOpciones && /^[Rr]espuesta:\s*[A-D]/i.test(linea)) {
                if (opcionesContador >= 4) { // Al menos 4 opciones detectadas
                    preguntasDetectadas++;
                }
                encontroOpciones = false;
                opcionesContador = 0;
            }
        }
        
        // También contar por bloques separados por líneas vacías
        const bloques = texto.trim().split(/\n\s*\n/);
        let preguntasPorBloques = 0;
        
        for (const bloque of bloques) {
            const lineasBloque = bloque.split('\n').filter(l => l.trim()).length;
            const tieneRespuesta = /[Rr]espuesta:\s*[A-D]/i.test(bloque);
            const tieneOpciones = /^[A-D][).]\s+/im.test(bloque);
            
            if (lineasBloque >= 6 && tieneRespuesta && tieneOpciones) {
                preguntasPorBloques++;
            }
        }
        
        // Usar el máximo entre ambos métodos
        const finalPreguntas = Math.max(preguntasDetectadas, preguntasPorBloques);
        
        // Mostrar estadísticas
        statsElement.textContent = `${finalPreguntas} preguntas detectadas | ${lineas} líneas`;
        
        // Mostrar vista previa de la primera pregunta válida
        if (finalPreguntas > 0) {
            for (const bloque of bloques) {
                if (bloque.trim() && /[Rr]espuesta:\s*[A-D]/i.test(bloque)) {
                    previewElement.style.display = 'block';
                    document.getElementById('bulkPreviewContent').textContent = bloque.trim();
                    break;
                }
            }
        } else {
            previewElement.style.display = 'none';
        }
    }
    
    async function procesarCargaMasiva() {
        const texto = document.getElementById('bulkText').value.trim();
        
        if (!texto) {
            showNotification('Por favor pega las preguntas primero', 'warning');
            return;
        }
        
        // Obtener valores de los selectores
        let subject = document.getElementById('bulkSubject').value;
        const newSubject = document.getElementById('bulkNewSubject').value.trim();
        let finalSubject = (subject === '_new_' && newSubject) ? newSubject : subject;
        
        let topic = document.getElementById('bulkTopic').value.trim();
        const isSimulator = document.getElementById('bulkIsSimulator').checked;
        const simulatorName = document.getElementById('bulkSimulatorName').value.trim();
        const simulatorSection = (document.getElementById('bulkSimulatorSection')?.value || '').trim();
        if (isSimulator) {
            if (!simulatorName) {
                showNotification('Escribe el nombre del simulador', 'warning');
                return;
            }
            if (!simulatorSection) {
                showNotification('Selecciona la materia interna del simulador', 'warning');
                return;
            }
            finalSubject = 'Simulador';
            topic = simulatorName;
        }
        const university = document.getElementById('bulkUniversity').value;
        
        // Validaciones
        if (!finalSubject) {
            showNotification('Por favor selecciona o escribe una materia', 'warning');
            return;
        }
        
        if (!topic) {
            showNotification('Por favor escribe el tema para las preguntas', 'warning');
            return;
        }
        
        const processBtn = document.getElementById('processBulkBtn');
        const originalText = processBtn.innerHTML;
        
        // Mostrar progreso
        document.getElementById('bulkProgressContainer').style.display = 'block';
        document.getElementById('bulkResultContainer').style.display = 'none';
        
        processBtn.innerHTML = '<i class="fas fa-spinner loading"></i> Procesando...';
        processBtn.disabled = true;
        
        try {
            updateProgress(10, 'Analizando texto...');
            
            const response = await fetch('/api/bulk_questions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    texto: texto,
                    subject: finalSubject,
                    topic: topic,
                    university: university,
                    simulator_subject: isSimulator ? simulatorSection : ''
                })
            });
            
            updateProgress(50, 'Enviando datos al servidor...');
            
            const data = await response.json();
            
            if (data.success) {
                updateProgress(100, '¡Completado!');
                
                // Mostrar resultados
                const resultContainer = document.getElementById('bulkResultContainer');
                resultContainer.style.display = 'block';
                resultContainer.className = 'result-container result-success';
                
                resultContainer.innerHTML = `
                    <div style="text-align: center;">
                        <i class="fas fa-check-circle" style="font-size: 2rem; margin-bottom: 10px;"></i>
                        <h4>¡Carga completada exitosamente!</h4>
                        
                        <div style="margin: 15px 0; text-align: left; background: rgba(255,255,255,0.5); padding: 10px; border-radius: 5px;">
                            <div><strong>Materia:</strong> ${finalSubject}</div>
                            <div><strong>Tema:</strong> ${topic}</div>
                            <div><strong>Universidad:</strong> ${university}</div>
                            <div><strong>Preguntas insertadas:</strong> ${data.inserted_count}</div>
                        </div>
                        
                        <p style="font-size: 0.9rem; color: #666; margin-top: 10px;">
                            <i class="fas fa-sync-alt"></i> Las preguntas se añadieron a la base de datos
                        </p>
                        
                        <div style="margin-top: 15px;">
                            <button class="btn btn-outline btn-sm" onclick="verPreguntasInsertadas(${data.inserted_count})">
                                <i class="fas fa-eye"></i> Ver preguntas
                            </button>
                            <button class="btn btn-primary btn-sm" onclick="cargarMasPreguntas()" style="margin-left: 10px;">
                                <i class="fas fa-plus"></i> Cargar más
                            </button>
                        </div>
                    </div>
                `;
                
                // Limpiar solo el texto, mantener materia y tema por si quieren añadir más
                document.getElementById('bulkText').value = '';
                
                showNotification(`✅ Se insertaron ${data.inserted_count} preguntas en ${finalSubject} - ${topic}`, 'success');
                
                // Recargar datos después de 2 segundos
                setTimeout(() => {
                    loadAllData();
                }, 2000);
                
            } else {
                updateProgress(100, 'Error');
                
                const resultContainer = document.getElementById('bulkResultContainer');
                resultContainer.style.display = 'block';
                resultContainer.className = 'result-container result-error';
                
                resultContainer.innerHTML = `
                    <div style="text-align: center;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 10px;"></i>
                        <h4>Error en la carga</h4>
                        <p>${data.error || 'Error desconocido'}</p>
                        
                        ${data.suggestions ? `
                            <div style="margin-top: 15px; text-align: left; font-size: 0.9rem;">
                                <strong>Sugerencias para corregir:</strong>
                                <ul style="margin: 10px 0 0 20px;">
                                    ${data.suggestions.map(s => `<li>${s}</li>`).join('')}
                                </ul>
                            </div>
                        ` : ''}
                        
                        <div style="margin-top: 20px;">
                            <button class="btn btn-outline btn-sm" onclick="document.getElementById('bulkText').focus()">
                                <i class="fas fa-edit"></i> Corregir texto
                            </button>
                        </div>
                    </div>
                `;
                
                showNotification(`❌ ${data.error}`, 'error');
            }
            
        } catch (error) {
            console.error('Error en carga masiva:', error);
            
            const resultContainer = document.getElementById('bulkResultContainer');
            resultContainer.style.display = 'block';
            resultContainer.className = 'result-container result-error';
            resultContainer.innerHTML = `
                <div style="text-align: center;">
                    <i class="fas fa-exclamation-circle" style="font-size: 2rem; margin-bottom: 10px;"></i>
                    <h4>Error de conexión</h4>
                    <p>No se pudo conectar con el servidor: ${error.message}</p>
                    <p style="font-size: 0.9rem; color: #666; margin-top: 10px;">
                        Verifica tu conexión a internet e intenta de nuevo.
                    </p>
                </div>
            `;
            
            showNotification('❌ Error de conexión con el servidor', 'error');
            
        } finally {
            processBtn.innerHTML = originalText;
            processBtn.disabled = false;
        }
    }
    
    function verPreguntasInsertadas(cantidad) {
        // Cierra el modal y va a la página de preguntas
        closeBulkModal();
        
        // Activa la pestaña de preguntas
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        
        document.querySelector('.menu-item[data-page="questions"]').classList.add('active');
        document.getElementById('questionsPage').classList.add('active');
        
        // Muestra un mensaje
        showNotification(`Verifica las ${cantidad} preguntas recién añadidas`, 'info');
    }
    
    function cargarMasPreguntas() {
        // Limpia solo el área de texto, mantiene los demás valores
        document.getElementById('bulkText').value = '';
        document.getElementById('bulkResultContainer').style.display = 'none';
        document.getElementById('bulkProgressContainer').style.display = 'none';
        document.getElementById('bulkText').focus();
        
        showNotification('Puedes pegar más preguntas', 'info');
    }





    // Función para actualizar la barra de progreso (agregar después de la función openBulkModal)
    function updateProgress(porcentaje, mensaje) {
        const progressBar = document.getElementById('bulkProgressBar');
        const progressText = document.getElementById('bulkProgressText');
        
        if (progressBar && progressText) {
            progressBar.style.width = porcentaje + '%';
            progressText.textContent = mensaje + ' ' + porcentaje + '%';
            
            // Cambiar color según el progreso
            if (porcentaje < 30) {
                progressBar.style.background = 'linear-gradient(90deg, #ef4444 0%, #f97316 100%)';
            } else if (porcentaje < 70) {
                progressBar.style.background = 'linear-gradient(90deg, #f59e0b 0%, #eab308 100%)';
            } else {
                progressBar.style.background = 'linear-gradient(90deg, var(--primary) 0%, var(--primary-light) 100%)';
            }
        }
    }

    function verPreguntasInsertadas(cantidad) {
        closeBulkModal();
        
        // Activar la pestaña de preguntas
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        
        const questionsMenuItem = document.querySelector('.menu-item[data-page="questions"]');
        if (questionsMenuItem) {
            questionsMenuItem.classList.add('active');
        }
        document.getElementById('questionsPage').classList.add('active');
        
        showNotification(`Verifica las ${cantidad} preguntas recién añadidas`, 'info');
    }


    function closeBulkModal() {
    document.getElementById('bulkModal').style.display = 'none';
}

    // AGREGAR ESTAS FUNCIONES AQUÍ:
    function updateProgress(porcentaje, mensaje) {
        const progressBar = document.getElementById('bulkProgressBar');
        const progressText = document.getElementById('bulkProgressText');
        
        if (progressBar && progressText) {
            progressBar.style.width = porcentaje + '%';
            progressText.textContent = mensaje + ' ' + porcentaje + '%';
            
            // Cambiar color según el progreso
            if (porcentaje < 30) {
                progressBar.style.background = 'linear-gradient(90deg, #ef4444 0%, #f97316 100%)';
            } else if (porcentaje < 70) {
                progressBar.style.background = 'linear-gradient(90deg, #f59e0b 0%, #eab308 100%)';
            } else {
                progressBar.style.background = 'linear-gradient(90deg, var(--primary) 0%, var(--primary-light) 100%)';
            }
        }
    }
    
    function verPreguntasInsertadas(cantidad) {
        closeBulkModal();
        
        // Activar la pestaña de preguntas
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        
        const questionsMenuItem = document.querySelector('.menu-item[data-page="questions"]');
        if (questionsMenuItem) {
            questionsMenuItem.classList.add('active');
        }
        document.getElementById('questionsPage').classList.add('active');
        
        showNotification(`Verifica las ${cantidad} preguntas recién añadidas`, 'info');
    }
    
    


        function analizarFormatoTexto(texto) {
            const formatos = {
                formato1: /(.*?)\nA[\).]\s*(.*?)\nB[\).]\s*(.*?)\nC[\).]\s*(.*?)\nD[\).]\s*(.*?)\n.*?[Rr]espuesta:\s*([A-D])/gi,
                formato2: /(\d+\.\s.*?)\n\(A\)\s*(.*?)\n\(B\)\s*(.*?)\n\(C\)\s*(.*?)\n\(D\)\s*(.*?)\n.*?[Cc]orrecta:\s*([A-D])/gi,
                formato3: /(PREGUNTA\s*\d+[\.:]\s*.*?)\nA\.\s*(.*?)\nB\.\s*(.*?)\nC\.\s*(.*?)\nD\.\s*(.*?)\n.*?SOLUCIÓN:\s*([A-D])/gi
            };
            
            const resultados = {
                formato: null,
                preguntas: []
            };
            
            for (const [formatoName, regex] of Object.entries(formatos)) {
                const matches = [...texto.matchAll(regex)];
                if (matches.length > 0) {
                    resultados.formato = formatoName;
                    resultados.preguntas = matches.map(match => ({
                        pregunta: match[1],
                        opciones: [match[2], match[3], match[4], match[5]],
                        respuesta: match[6]
                    }));
                    break;
                }
            }
            
            return resultados;
        }


        function ejemploFormato() {
            const ejemplo = `Calcula el área del triángulo con base 10 y altura 5
        A) 25 cm²
        B) 30 cm²
        C) 35 cm²
        D) 40 cm²
        Respuesta: A
        
        Resuelve la ecuación: 2x + 5 = 15
        A) x = 5
        B) x = 6
        C) x = 7
        D) x = 8
        Respuesta: A
        
        ¿Cuál es la capital de Francia?
        A) Madrid
        B) Roma
        C) París
        D) Berlín
        Respuesta: C`;
        
            document.getElementById('bulkText').value = ejemplo;
            actualizarEstadisticasBulk();
            document.getElementById('bulkText').focus();
            
            showNotification('Ejemplo cargado. Puedes editarlo o añadir más preguntas', 'info');
        }



// Función para mostrar vista previa de imagen
function setupImagePreview() {
    const imageInput = document.getElementById('modalImage');
    const previewContainer = document.getElementById('imagePreviewContainer');
    const previewImage = document.getElementById('previewImage');
    
    if (!imageInput || !previewContainer) return;
    
    imageInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            currentImageFile = file;
            
            // Mostrar vista previa
            const reader = new FileReader();
            reader.onload = function(e) {
                previewImage.src = e.target.result;
                previewContainer.style.display = 'block';
            };
            reader.readAsDataURL(file);
        } else {
            currentImageFile = null;
            previewContainer.style.display = 'none';
        }
    });
}

// Función para quitar imagen
function removeImage() {
    currentImageFile = null;
    existingImageUrl = null;
    
    document.getElementById('modalImage').value = '';
    document.getElementById('imagePreviewContainer').style.display = 'none';
    document.getElementById('previewImage').src = '';
}

// Modificar la función editQuestion para cargar imagen existente
function editQuestion(questionId) {
    const question = allQuestions.find(q => q._id === questionId);
    if (!question) {
        showNotification('Pregunta no encontrada', 'error');
        return;
    }
    
    isEditMode = true;
    currentEditQuestionId = questionId;
    
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> Editar Pregunta';
    document.getElementById('saveQuestionBtn').innerHTML = '<i class="fas fa-save"></i> Actualizar Pregunta';
    
    // Cargar datos básicos
    document.getElementById('modalSubject').value = question.subject;
    document.getElementById('modalTopic').value = question.topic;
    loadModalTopics(question.subject);
    document.getElementById('modalQuestion').value = question.question;
    document.getElementById('modalSolution').value = question.solution || '';
    document.getElementById('modalUniversity').value = question.university || 'UNAM';
    document.getElementById('modalIsSimulator').checked = question.subject === 'Simulador';
    document.getElementById('modalSimulatorName').value = question.subject === 'Simulador' ? question.topic : '';
    document.getElementById('modalSimulatorSection').value = question.simulator_subject || '';
    toggleSimulatorMode();
    
    // Cargar imagen existente si hay
    if (question.image) {
        existingImageUrl = question.image;
        document.getElementById('imagePreviewContainer').style.display = 'block';
        document.getElementById('previewImage').src = `/static/img/${question.image}`;
    } else {
        existingImageUrl = null;
        document.getElementById('imagePreviewContainer').style.display = 'none';
    }
    
    // Cargar opciones
    if (question.has_options && question.options && question.options.length > 0) {
        document.getElementById('hasOptionsCheckbox').checked = true;
        toggleOptions();
        
        document.getElementById('optionA').value = question.options[0] || '';
        document.getElementById('optionB').value = question.options[1] || '';
        document.getElementById('optionC').value = question.options[2] || '';
        document.getElementById('optionD').value = question.options[3] || '';
        
        if (question.correct_option >= 0 && question.correct_option < 4) {
            const correctRadio = document.getElementById(`correctOption${String.fromCharCode(65 + question.correct_option)}`);
            if (correctRadio) {
                correctRadio.checked = true;
            }
        }
        
        document.getElementById('modalAnswer').value = '';
    } else {
        document.getElementById('hasOptionsCheckbox').checked = false;
        toggleOptions();
        document.getElementById('modalAnswer').value = question.answer || question.correct_answer || '';
    }
    
    document.getElementById('questionModal').classList.add('active');
}


// Función para ver imagen ampliada
function expandImage(src) {
    expandQuestionImage(src);
}

// Función para cerrar imagen ampliada


// Evitar que el clic en la imagen cierre el modal
document.getElementById('modalExpandedImage').addEventListener('click', function(e) {
    e.stopPropagation();
});


// Agregar esta función cerca de las otras funciones de utilidad
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

function closeExpandedImage() {
    const modal = document.querySelector('.image-expand-modal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = '';
    }
    document.removeEventListener('keydown', handleEscKey);
}

// Función para expandir imagen (IGUAL QUE EN index.js)
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

function closeExpandedImage() {
    const modal = document.querySelector('.image-expand-modal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = '';
    }
    document.removeEventListener('keydown', handleEscKey);
}




