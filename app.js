// Tự động hủy đăng ký Service Worker cũ và xóa Cache để giải quyết triệt để lỗi cache PWA khi phát triển
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      registration.unregister().then(function() {
        console.log("Đã hủy đăng ký Service Worker cũ.");
      });
    }
  });
}
if ('caches' in window) {
  caches.keys().then(function(names) {
    for (let name of names) {
      caches.delete(name);
    }
  });
}

// ============================================================================
// 1. KHỞI TẠO DỮ LIỆU & STORAGE
// ============================================================================

// Khởi tạo các bảng dữ liệu trong localStorage nếu chưa tồn tại
if (!localStorage.getItem('study_accounts')) {
  localStorage.setItem('study_accounts', JSON.stringify(DEFAULT_ACCOUNTS));
}
if (!localStorage.getItem('study_departments')) {
  localStorage.setItem('study_departments', JSON.stringify(DEFAULT_DEPARTMENTS));
}
if (!localStorage.getItem('study_results')) {
  localStorage.setItem('study_results', JSON.stringify(DEFAULT_RESULTS));
}
if (!localStorage.getItem('study_personal_questions')) {
  localStorage.setItem('study_personal_questions', JSON.stringify([]));
}

// Khai báo các đối tượng dữ liệu trực tiếp từ localStorage
let accounts = JSON.parse(localStorage.getItem('study_accounts'));
let departments = JSON.parse(localStorage.getItem('study_departments'));
let results = JSON.parse(localStorage.getItem('study_results'));
let personalQuestions = JSON.parse(localStorage.getItem('study_personal_questions'));

// Đồng bộ hóa các môn học và đề thi mặc định mới từ mock_data.js nếu chưa có trong localStorage
let isStorageUpdated = false;
for (const deptId in DEFAULT_DEPARTMENTS) {
  if (!departments[deptId]) {
    departments[deptId] = JSON.parse(JSON.stringify(DEFAULT_DEPARTMENTS[deptId]));
    isStorageUpdated = true;
  } else {
    if (!departments[deptId].subjects) {
      departments[deptId].subjects = [];
    }
    const defaultSubjects = DEFAULT_DEPARTMENTS[deptId].subjects || [];
    defaultSubjects.forEach(defaultSub => {
      const existingSubIndex = departments[deptId].subjects.findIndex(s => s.id === defaultSub.id);
      if (existingSubIndex === -1) {
        departments[deptId].subjects.push(JSON.parse(JSON.stringify(defaultSub)));
        isStorageUpdated = true;
      } else {
        // Nếu môn học đã tồn tại, kiểm tra xem có đề thi mặc định nào mới chưa có không
        const localExams = departments[deptId].subjects[existingSubIndex].exams || [];
        const defaultExams = defaultSub.exams || [];
        defaultExams.forEach(defaultExam => {
          const examExists = localExams.some(e => e.id === defaultExam.id);
          if (!examExists) {
            localExams.push(JSON.parse(JSON.stringify(defaultExam)));
            isStorageUpdated = true;
          }
        });
        departments[deptId].subjects[existingSubIndex].exams = localExams;
      }
    });
  }
}
for (const deptId in departments) {
  if (!DEFAULT_DEPARTMENTS[deptId]) {
    delete departments[deptId];
    isStorageUpdated = true;
  }
}
if (isStorageUpdated) {
  localStorage.setItem('study_departments', JSON.stringify(departments));
}

// Biến lưu danh sách tài khoản mặc định đã xóa trên server
let deletedDefaultAccounts = [];
let comments = JSON.parse(localStorage.getItem('study_comments')) || {};

async function syncDataFromServer() {
  try {
    const res = await fetch('/api/data');
    const serverData = await res.json();

    if (serverData && serverData.status !== 'empty' && serverData.status !== 'error') {
      accounts = serverData.accounts || [];
      departments = serverData.departments || {};
      
      let serverNeedsClean = false;
      for (const deptId in departments) {
        if (!DEFAULT_DEPARTMENTS[deptId]) {
          delete departments[deptId];
          serverNeedsClean = true;
        }
      }

      results = serverData.results || [];
      personalQuestions = serverData.personalQuestions || [];
      deletedDefaultAccounts = serverData.deletedDefaultAccounts || [];
      comments = serverData.comments || {};
      
      // Lưu lại vào localStorage
      localStorage.setItem('study_accounts', JSON.stringify(accounts));
      localStorage.setItem('study_departments', JSON.stringify(departments));
      localStorage.setItem('study_results', JSON.stringify(results));
      localStorage.setItem('study_personal_questions', JSON.stringify(personalQuestions));
      localStorage.setItem('study_comments', JSON.stringify(comments));
      if (serverData.announcement) {
        localStorage.setItem('study_announcement', serverData.announcement);
      }
      if (serverNeedsClean) {
        await saveDataToServer();
      }
    } else {
      // Nếu server rỗng hoặc lỗi, lưu dữ liệu mặc định hiện tại từ localStorage lên server
      await saveDataToServer();
    }
  } catch (err) {
    console.error("Lỗi khi đồng bộ dữ liệu từ server:", err);
  }
}

async function saveDataToServer() {
  const data = {
    accounts: accounts,
    departments: departments,
    results: results,
    personalQuestions: personalQuestions,
    deletedDefaultAccounts: deletedDefaultAccounts,
    announcement: localStorage.getItem('study_announcement') || '',
    comments: comments
  };
  try {
    await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (err) {
    console.error("Lỗi khi lưu dữ liệu lên server:", err);
  }
}

// Cập nhật dữ liệu vào localStorage và đồng bộ hóa lên server
function saveAccounts() {
  localStorage.setItem('study_accounts', JSON.stringify(accounts));
  saveDataToServer();
}
function saveDepartments() {
  localStorage.setItem('study_departments', JSON.stringify(departments));
  saveDataToServer();
}
function saveResults() {
  localStorage.setItem('study_results', JSON.stringify(results));
  saveDataToServer();
}
function savePersonalQuestions() {
  localStorage.setItem('study_personal_questions', JSON.stringify(personalQuestions));
  saveDataToServer();
}
function saveComments() {
  localStorage.setItem('study_comments', JSON.stringify(comments));
  saveDataToServer();
}

// ============================================================================
// 2. BIẾN TRẠNG THÁI TOÀN CỤC (STATE MANAGEMENT)
// ============================================================================
let currentUser = null;
let currentView = 'login';
let currentPersonalTab = 'practice';

// Biến lưu danh sách môn học đã mở khóa bằng mật khẩu và trạng thái bộ lọc kết quả
let unlockedSubjects = [];
let selectedResultDept = 'all';
let selectedResultSubject = 'all';
let selectedResultUnit = 'all';

// Trạng thái luyện tập cá nhân
let currentPersonalQIndex = -1;
let personalPracticeChecked = false;

// Trạng thái thi cá nhân
let personalTestState = {
  questions: [],
  answers: {}, // index -> selected answer (e.g. 'A' or student essay text)
  timer: null,
  timeLeft: 0,
  limit: 5,
  currentTime: 0
};

// Trạng thái ôn thi Hệ thống
let systemState = {
  currentDeptId: '',
  currentSubjectId: '',
  currentExamId: '',
  practiceMode: false, // true = Luyện tập (xem kết quả ngay), false = Kiểm tra (tính giờ)
  questions: [],
  currentQIndex: 0,
  answers: {}, // qId -> selected option or essay text
  timer: null,
  timeLeft: 0,
  checkedAnswers: {}, // qId -> boolean (dành cho chế độ luyện tập để hiện kết quả)
  submitted: false
};

// ============================================================================
// 3. ĐIỀU PHỐI GIAO DIỆN (NAVIGATION & ROUTING)
// ============================================================================
function navigateTo(viewId) {
  currentView = viewId;
  localStorage.setItem('study_current_view', viewId);
  
  // Ẩn tất cả các Section
  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.add('d-none');
  });

  // Hiện Section được chọn
  const activeSection = document.getElementById(`${viewId}-view`);
  if (activeSection) {
    activeSection.classList.remove('d-none');
  }

  // Cập nhật thông báo đăng nhập nếu chuyển về login
  if (viewId === 'login') {
    updateLoginAnnouncement();
  }

  // Cập nhật trạng thái Active trên Navbar
  document.querySelectorAll('#main-nav .nav-link').forEach(link => {
    link.classList.remove('active');
  });
  const activeNavLink = document.getElementById(`nav-${viewId}`);
  if (activeNavLink) {
    activeNavLink.classList.add('active');
  }

  // Thu nhỏ Menu Mobile sau khi click
  const navbarCollapse = document.getElementById('navbarNav');
  if (navbarCollapse && navbarCollapse.classList.contains('show')) {
    let instance = bootstrap.Collapse.getInstance(navbarCollapse);
    if (!instance) {
      instance = new bootstrap.Collapse(navbarCollapse, { toggle: false });
    }
    instance.hide();
  }

  // Reset timers nếu chuyển trang
  if (viewId !== 'personal' && personalTestState.timer) {
    clearInterval(personalTestState.timer);
    personalTestState.timer = null;
  }
  if (viewId !== 'system' && systemState.timer) {
    clearInterval(systemState.timer);
    systemState.timer = null;
  }

  // Kích hoạt render cụ thể cho từng View
  if (viewId === 'dashboard') {
    renderDashboard();
  } else if (viewId === 'personal') {
    renderPersonal();
  } else if (viewId === 'system') {
    renderSystem();
  } else if (viewId === 'results') {
    renderResults();
  } else if (viewId === 'admin') {
    renderAdmin();
  }
}

// Chạy demo điền form đăng nhập
function fillDemoAcc(username, password) {
  document.getElementById('login-username').value = username;
  document.getElementById('login-password').value = password;
}

// Helper setup UI sau khi đăng nhập thành công
function setupLoggedInUI(user) {
  let roleText = 'Học viên';
  if (user.role === 'super_admin') {
    roleText = 'Cán bộ';
  } else if (user.role === 'development') {
    roleText = 'Developer';
  } else if (user.role === 'faculty_admin') {
    roleText = `Giáo viên ${user.department}`;
  }

  // Cập nhật thông tin hiển thị trên navbar và sidebar
  const nameNav = document.getElementById('user-display-name-nav');
  if (nameNav) nameNav.innerText = user.name;
  
  const nameSidebar = document.getElementById('user-display-name-sidebar');
  if (nameSidebar) nameSidebar.innerText = user.name;

  const roleSidebar = document.getElementById('user-display-role-sidebar');
  if (roleSidebar) roleSidebar.innerText = roleText;

  // Hiển thị Navbar và cấu hình các tab đặc quyền
  const mainNav = document.getElementById('main-nav');
  if (mainNav) mainNav.classList.remove('d-none');

  // Tất cả vai trò (bao gồm cả học viên) đều có quyền xem tab Kết quả thi
  const resultsNav = document.getElementById('nav-results-item');
  if (resultsNav) resultsNav.classList.remove('d-none');

  // Phân quyền Tab Quản lý tài khoản trên Navbar
  const adminNav = document.getElementById('nav-admin-item');
  if (adminNav) {
    if (user.role === 'super_admin' || user.role === 'development') {
      adminNav.classList.remove('d-none');
    } else {
      adminNav.classList.add('d-none');
    }
  }

  // Phân quyền Nút Quản lý tài khoản trên Sidebar
  const sidebarAdminBtn = document.getElementById('sidebar-admin-btn');
  if (sidebarAdminBtn) {
    if (user.role === 'super_admin' || user.role === 'development') {
      sidebarAdminBtn.classList.remove('d-none');
    } else {
      sidebarAdminBtn.classList.add('d-none');
    }
  }
}

// ============================================================================
// 4. LOGIC ĐĂNG NHẬP & PHÂN QUYỀN
// ============================================================================
function handleLogin(event) {
  event.preventDefault();
  const usernameInput = document.getElementById('login-username').value.trim();
  const passwordInput = document.getElementById('login-password').value;

  const foundUser = accounts.find(acc => acc.username === usernameInput && acc.password === passwordInput);

  if (foundUser) {
    currentUser = foundUser;
    localStorage.setItem('study_current_user', JSON.stringify(currentUser));
    setupLoggedInUI(currentUser);
    navigateTo('dashboard');
  } else {
    // Hiệu ứng rung báo lỗi đăng nhập sai
    const cardElement = document.querySelector('#login-view .glass-card');
    cardElement.classList.add('shake', 'border-danger');
    setTimeout(() => {
      cardElement.classList.remove('shake', 'border-danger');
    }, 500);
    alert('Tên đăng nhập hoặc mật khẩu không chính xác!');
  }
}

function logout() {
  currentUser = null;
  localStorage.removeItem('study_current_user');
  localStorage.removeItem('study_current_view');
  document.getElementById('login-form').reset();
  const mainNav = document.getElementById('main-nav');
  if (mainNav) mainNav.classList.add('d-none');
  navigateTo('login');
}

// ============================================================================
// 5. PHÂN HỆ: CÁ NHÂN (PERSONAL VIEW LOGIC)
// ============================================================================
function renderPersonal() {
  // Cập nhật số lượng câu hỏi cá nhân
  document.getElementById('personal-q-count').innerText = personalQuestions.length;
  
  if (currentPersonalTab === 'practice') {
    loadPersonalPracticeList();
  } else if (currentPersonalTab === 'test') {
    resetPersonalTestSetup();
  } else if (currentPersonalTab === 'add') {
    togglePersonalQFields();
  }
}

function switchPersonalTab(tabName) {
  currentPersonalTab = tabName;
  
  // Update Pills UI active class
  document.querySelectorAll('#personal-tabs button').forEach(btn => {
    btn.classList.remove('active');
  });
  document.getElementById(`tab-btn-${tabName}`).classList.add('active');

  // Hide/Show tab contents
  document.querySelectorAll('.personal-tab').forEach(content => {
    content.classList.add('d-none');
  });
  document.getElementById(`personal-tab-${tabName}`).classList.remove('d-none');

  renderPersonal();
}

// --- 5.1 Thêm câu hỏi cá nhân ---
function togglePersonalQFields() {
  const type = document.getElementById('pq-type').value;
  const choiceFields = document.getElementById('pq-choice-fields');
  const essayFields = document.getElementById('pq-essay-fields');
  const graphicFields = document.getElementById('pq-graphic-fields');
  const keywordsContainer = document.getElementById('pq-keywords-container');

  // Ẩn tất cả trước
  if (choiceFields) choiceFields.classList.add('d-none');
  if (essayFields) essayFields.classList.add('d-none');
  if (graphicFields) graphicFields.classList.add('d-none');

  // Reset required attributes
  document.getElementById('pq-optA').removeAttribute('required');
  document.getElementById('pq-optB').removeAttribute('required');
  const fileInput = document.getElementById('pq-graphic-image-file');
  if (fileInput) fileInput.removeAttribute('required');

  if (type === 'choice') {
    if (choiceFields) choiceFields.classList.remove('d-none');
    document.getElementById('pq-optA').setAttribute('required', 'true');
    document.getElementById('pq-optB').setAttribute('required', 'true');
  } else if (type === 'essay' || type === 'interview') {
    if (essayFields) essayFields.classList.remove('d-none');
    if (type === 'interview') {
      if (keywordsContainer) keywordsContainer.classList.remove('d-none');
    } else {
      if (keywordsContainer) keywordsContainer.classList.add('d-none');
    }
  } else if (type === 'graphic') {
    if (graphicFields) graphicFields.classList.remove('d-none');
    if (fileInput && !document.getElementById('pq-graphic-image-base64').value) {
      fileInput.setAttribute('required', 'true');
    }
  }
}

function savePersonalQuestion(event) {
  event.preventDefault();
  const type = document.getElementById('pq-type').value;
  const questionText = document.getElementById('pq-question').value.trim();
  const explanation = document.getElementById('pq-explanation').value.trim();
  const deptId = document.getElementById('pq-select-dept').value;
  const subjectId = document.getElementById('pq-select-subject').value;

  if (!deptId || !subjectId) {
    alert('Vui lòng chọn Khoa và Môn học!');
    return;
  }

  let newQ = {
    id: 'pq_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    type: type,
    deptId: deptId,
    subjectId: subjectId,
    question: questionText,
    explanation: explanation
  };

  if (type === 'choice') {
    newQ.options = {
      A: document.getElementById('pq-optA').value.trim(),
      B: document.getElementById('pq-optB').value.trim(),
      C: document.getElementById('pq-optC').value.trim(),
      D: document.getElementById('pq-optD').value.trim()
    };
    newQ.correct = document.getElementById('pq-correct').value;
  } else if (type === 'essay' || type === 'interview') {
    newQ.sampleAnswer = document.getElementById('pq-sample').value.trim();
    newQ.barem = document.getElementById('pq-barem').value.trim();
    if (type === 'interview') {
      const kwVal = document.getElementById('pq-keywords').value;
      newQ.keywords = kwVal ? kwVal.split(',').map(s => s.trim()).filter(Boolean) : [];
    }
  } else if (type === 'graphic') {
    const base64Img = document.getElementById('pq-graphic-image-base64').value;
    if (!base64Img) {
      alert('Vui lòng tải ảnh nền lên!');
      return;
    }
    newQ.image = base64Img;
    newQ.tools = {
      line: document.getElementById('pq-tool-line').checked,
      erase: document.getElementById('pq-tool-erase').checked,
      tmtc: document.getElementById('pq-tool-tmtc').checked
    };
  }

  personalQuestions.push(newQ);
  savePersonalQuestions();
  
  document.getElementById('add-personal-q-form').reset();
  togglePersonalQFields();
  alert('Đã thêm câu hỏi cá nhân thành công!');
  switchPersonalTab('practice');
}

// --- 5.2 Luyện tập cá nhân ---
function loadPersonalPracticeList() {
  const listContainer = document.getElementById('personal-q-list');
  listContainer.innerHTML = '';

  if (personalQuestions.length === 0) {
    listContainer.innerHTML = `
      <div class="text-center py-5 text-secondary">
        <i class="bi bi-inbox fs-1 d-block mb-2"></i>
        Chưa có câu hỏi nào.
      </div>
    `;
    document.getElementById('personal-practice-display').innerHTML = `
      <div class="text-center py-5 my-5 text-secondary">
        <i class="bi bi-plus-circle fs-1 d-block mb-3 text-info"></i>
        <h4 class="text-light">Chưa có câu hỏi cá nhân</h4>
        <p class="small max-w-400 mx-auto">Vui lòng sang tab "Thêm câu hỏi" để tự tạo bộ đề trắc nghiệm hoặc tự luận cho chính mình.</p>
      </div>
    `;
    return;
  }

  personalQuestions.forEach((q, idx) => {
    const qDiv = document.createElement('div');
    qDiv.className = `p-3 rounded-3 border bg-dark-glass pointer text-start text-truncate ${currentPersonalQIndex === idx ? 'border-info' : 'border-secondary'}`;
    qDiv.innerHTML = `
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div class="text-truncate">
          <span class="badge ${q.type === 'choice' ? 'bg-primary-glass text-info' : 'bg-purple-glass text-purple-light'} mb-1 me-1">${q.type === 'choice' ? 'Trắc nghiệm' : 'Tự luận'}</span>
          <span class="text-light small text-wrap">${idx + 1}. ${q.question}</span>
        </div>
        <button class="btn btn-sm text-danger border-0 p-0 fs-6" onclick="deletePersonalQuestion(event, ${idx})">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    `;
    qDiv.onclick = () => selectPersonalPracticeQuestion(idx);
    listContainer.appendChild(qDiv);
  });

  if (currentPersonalQIndex >= 0 && currentPersonalQIndex < personalQuestions.length) {
    renderPersonalPracticeQuestion();
  } else {
    // Select first question by default
    selectPersonalPracticeQuestion(0);
  }
}

function selectPersonalPracticeQuestion(index) {
  currentPersonalQIndex = index;
  personalPracticeChecked = false;
  // Cập nhật active highlight trong danh sách bên trái
  document.querySelectorAll('#personal-q-list > div').forEach((el, idx) => {
    if (idx === index) {
      el.classList.replace('border-secondary', 'border-info');
    } else {
      el.classList.replace('border-info', 'border-secondary');
    }
  });
  renderPersonalPracticeQuestion();
}

function renderPersonalPracticeQuestion() {
  const display = document.getElementById('personal-practice-display');
  const q = personalQuestions[currentPersonalQIndex];

  if (!q) return;

  let badgeText = 'Tự luận';
  let badgeClass = 'bg-purple-glass text-purple-light';
  if (q.type === 'choice') {
    badgeText = 'Trắc nghiệm';
    badgeClass = 'bg-primary-glass text-info';
  } else if (q.type === 'interview') {
    badgeText = 'Vấn đáp AI';
    badgeClass = 'bg-danger-glass text-warning-light';
  }

  let html = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <span class="badge bg-secondary-glass text-secondary-light">Câu hỏi ${currentPersonalQIndex + 1} của ${personalQuestions.length}</span>
      <span class="badge ${badgeClass}">${badgeText}</span>
    </div>
    <h4 class="h5 fw-bold text-light mb-4 text-start line-height-base">${q.question}</h4>
  `;

  if (q.type === 'choice') {
    html += `<div class="d-flex flex-column gap-2 mb-4">`;
    for (const [key, value] of Object.entries(q.options)) {
      if (value) {
        html += `
          <button class="option-btn" id="p-opt-${key}" onclick="selectPersonalPracticeOption('${key}')">
            <strong>${key}.</strong> ${value}
          </button>
        `;
      }
    }
    html += `</div>
      <div class="d-flex justify-content-between align-items-center mt-3">
        <button class="btn btn-info text-dark rounded-pill px-4 fw-bold" onclick="checkPersonalPracticeAnswer()">
          Kiểm tra đáp án
        </button>
      </div>
    `;
  } else if (q.type === 'essay') {
    // Tự luận
    html += `
      <div class="mb-4 text-start">
        <label class="form-label text-secondary small">Nhập câu trả lời của bạn (để tự chấm điểm):</label>
        <textarea class="form-control bg-dark-glass text-light border-secondary" id="p-essay-ans" rows="4" placeholder="Nhập bài giải tự luận..."></textarea>
      </div>
      <div class="d-flex justify-content-between align-items-center">
        <button class="btn btn-info text-dark rounded-pill px-4 fw-bold" onclick="showPersonalPracticeEssayAnswer()">
          Hiện đáp án mẫu
        </button>
      </div>
    `;
  } else {
    // Vấn đáp (interview)
    html += `
      <div class="mb-4 text-start">
        <label class="form-label text-secondary small">Trả lời vấn đáp (Nói hoặc Nhập văn bản):</label>
        <textarea class="form-control bg-dark-glass text-light border-secondary mb-3" id="p-interview-ans" rows="4" placeholder="Từ nói sẽ hiển thị tại đây..."></textarea>
        
        <div class="mic-btn-container">
          <button type="button" class="mic-btn" id="p-mic-btn" onclick="toggleSpeechRecognition(${currentPersonalQIndex}, 'p-mic-btn', 'p-interview-ans')">
            <i class="bi bi-mic-fill"></i>
          </button>
          <div class="sound-waves" id="waves-${currentPersonalQIndex}">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <span class="small text-secondary mt-2" id="p-mic-status">Nhấp để bắt đầu nói</span>
        </div>
      </div>
      
      <div class="d-flex justify-content-between align-items-center">
        <button class="btn btn-info text-dark rounded-pill px-4 fw-bold" id="p-ai-grade-btn" onclick="checkPersonalPracticeInterview()">
          <i class="bi bi-robot me-1"></i>AI Chấm Điểm
        </button>
      </div>

      <!-- Vùng hiển thị kết quả AI -->
      <div class="mt-4 p-4 rounded-3 border border-secondary bg-black-glass d-none text-start" id="p-ai-result-card">
        <div class="ai-score-circle score-high" id="p-ai-score-circle">
          <span class="ai-score-value text-info" id="p-ai-score-val">0</span>
          <span class="ai-score-label">Điểm số</span>
        </div>
        <div class="mb-3">
          <strong class="text-info d-block mb-1 small"><i class="bi bi-card-checklist me-1"></i>Phân tích Barem Điểm:</strong>
          <div class="p-2.5 rounded bg-dark-glass border border-secondary text-secondary small text-wrap" id="p-ai-barem-breakdown">...</div>
        </div>
        <div class="row g-2 mb-3">
          <div class="col-6">
            <div class="p-2 rounded bg-dark-glass border border-secondary text-start">
              <span class="text-secondary d-block small">Trôi chảy</span>
              <span class="text-light small" id="p-ai-fluency">...</span>
            </div>
          </div>
          <div class="col-6">
            <div class="p-2 rounded bg-dark-glass border border-secondary text-start">
              <span class="text-secondary d-block small">Chính xác</span>
              <span class="text-light small" id="p-ai-accuracy">...</span>
            </div>
          </div>
        </div>
        <div>
          <strong class="text-success d-block mb-1 small"><i class="bi bi-chat-left-dots me-1"></i>Lời khuyên của AI:</strong>
          <p class="text-secondary small m-0" id="p-ai-feedback">...</p>
        </div>
      </div>
    `;
  }

  // Vùng hiển thị giải thích chi tiết ẩn mặc định (chung cho Choice & Essay)
  html += `
    <div class="mt-4 p-3 rounded-3 border border-secondary bg-dark-glass d-none text-start" id="personal-practice-explanation">
      <div class="fw-bold mb-1 text-info"><i class="bi bi-info-circle me-1"></i>Đáp án đúng & Giải thích:</div>
      <div id="pq-exp-correct-ans" class="mb-2"></div>
      <p class="text-secondary small m-0">${q.explanation || 'Không có giải thích bổ sung.'}</p>
    </div>
  `;

  display.innerHTML = html;
}

let selectedPersonalPracticeOptionKey = '';
function selectPersonalPracticeOption(key) {
  if (personalPracticeChecked) return; // Đã kiểm tra thì không cho chọn lại
  selectedPersonalPracticeOptionKey = key;
  document.querySelectorAll('#personal-practice-display .option-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
  document.getElementById(`p-opt-${key}`).classList.add('selected');
}

function checkPersonalPracticeAnswer() {
  const q = personalQuestions[currentPersonalQIndex];
  if (!selectedPersonalPracticeOptionKey) {
    alert('Vui lòng chọn một đáp án trước!');
    return;
  }
  personalPracticeChecked = true;
  
  const correctKey = q.correct;
  const optBtnSelected = document.getElementById(`p-opt-${selectedPersonalPracticeOptionKey}`);
  const optBtnCorrect = document.getElementById(`p-opt-${correctKey}`);

  // Highlight đáp án
  if (selectedPersonalPracticeOptionKey === correctKey) {
    optBtnSelected.classList.replace('selected', 'correct');
  } else {
    optBtnSelected.classList.replace('selected', 'wrong');
    if (optBtnCorrect) optBtnCorrect.classList.add('correct');
  }

  // Hiện giải thích
  const expDiv = document.getElementById('personal-practice-explanation');
  document.getElementById('pq-exp-correct-ans').innerHTML = `Đáp án chính xác: <strong class="text-success">${correctKey}</strong>`;
  expDiv.classList.remove('d-none');
}

function showPersonalPracticeEssayAnswer() {
  const q = personalQuestions[currentPersonalQIndex];
  const expDiv = document.getElementById('personal-practice-explanation');
  document.getElementById('pq-exp-correct-ans').innerHTML = `Đáp án mẫu: <br><div class="p-2 bg-black-glass text-light rounded-3 mt-1 small">${q.sampleAnswer || 'Không có đáp án mẫu'}</div>`;
  expDiv.classList.remove('d-none');
}

function deletePersonalQuestion(event, index) {
  event.stopPropagation(); // Ngăn sự kiện click vào card câu hỏi
  if (confirm('Bạn có chắc chắn muốn xóa câu hỏi cá nhân này?')) {
    personalQuestions.splice(index, 1);
    savePersonalQuestions();
    currentPersonalQIndex = -1;
    loadPersonalPracticeList();
  }
}

function clearAllPersonalQuestions() {
  if (confirm('CẢNH BÁO: Bạn có muốn xóa sạch toàn bộ danh sách câu hỏi cá nhân không? Thao tác này không thể hoàn tác.')) {
    personalQuestions = [];
    savePersonalQuestions();
    currentPersonalQIndex = -1;
    loadPersonalPracticeList();
  }
}

// --- 5.3 Kiểm tra cá nhân ---
function resetPersonalTestSetup() {
  document.getElementById('personal-test-setup').classList.remove('d-none');
  document.getElementById('personal-test-runner').classList.add('d-none');
}

function startPersonalTest() {
  if (personalQuestions.length === 0) {
    alert('Danh sách câu hỏi cá nhân trống! Vui lòng thêm câu hỏi trước khi kiểm tra.');
    return;
  }

  const limitRaw = document.getElementById('test-q-limit').value.trim();
  const timeRaw = document.getElementById('test-time-limit').value.trim();

  if (!limitRaw || isNaN(limitRaw) || parseInt(limitRaw) <= 0) {
    alert('Vui lòng nhập số lượng câu hỏi hợp lệ (số nguyên dương)!');
    return;
  }
  if (!timeRaw || isNaN(timeRaw) || parseInt(timeRaw) <= 0) {
    alert('Vui lòng nhập thời gian làm bài hợp lệ (số nguyên dương)!');
    return;
  }

  const limitVal = parseInt(limitRaw);
  const timeVal = parseInt(timeRaw);
  
  // Trộn và lấy số câu hỏi giới hạn
  let shuffled = [...personalQuestions].sort(() => 0.5 - Math.random());
  let count = Math.min(limitVal, shuffled.length);
  
  personalTestState.questions = shuffled.slice(0, count);
  personalTestState.answers = {};
  personalTestState.timeLeft = timeVal * 60;
  personalTestState.limit = count;
  personalTestState.currentTime = 0;

  document.getElementById('personal-test-setup').classList.add('d-none');
  const runner = document.getElementById('personal-test-runner');
  runner.classList.remove('d-none');

  renderPersonalTestRunner(0);
  startPersonalTestTimer();
}

function startPersonalTestTimer() {
  if (personalTestState.timer) clearInterval(personalTestState.timer);
  personalTestState.timer = setInterval(() => {
    personalTestState.timeLeft--;
    personalTestState.currentTime++;
    
    // Cập nhật hiển thị đồng hồ
    const timerDisplay = document.getElementById('personal-test-timer');
    if (timerDisplay) {
      const minutes = Math.floor(personalTestState.timeLeft / 60);
      const seconds = personalTestState.timeLeft % 60;
      timerDisplay.innerText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      if (personalTestState.timeLeft <= 30) {
        timerDisplay.className = 'badge bg-danger fs-5 pulse';
      }
    }

    if (personalTestState.timeLeft <= 0) {
      clearInterval(personalTestState.timer);
      alert('Hết giờ làm bài! Hệ thống tự động thu bài của bạn.');
      submitPersonalTest();
    }
  }, 1000);
}

function renderPersonalTestRunner(qIdx) {
  const runner = document.getElementById('personal-test-runner');
  const q = personalTestState.questions[qIdx];
  const minutes = Math.floor(personalTestState.timeLeft / 60);
  const seconds = personalTestState.timeLeft % 60;

  let html = `
    <div class="card glass-card border-secondary p-4 mb-4">
      <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4 pb-2 border-bottom border-secondary">
        <div>
          <h4 class="h5 fw-bold text-light m-0">Bài Kiểm Tra Cá Nhân</h4>
          <span class="small text-secondary">Câu hỏi ${qIdx + 1} của ${personalTestState.questions.length}</span>
        </div>
        <div class="d-flex align-items-center gap-3">
          <span class="small text-secondary">Thời gian còn lại:</span>
          <span class="badge bg-dark-glass border-secondary fs-5 text-info" id="personal-test-timer">
            ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}
          </span>
        </div>
      </div>

      <div class="question-body text-start">
        <h5 class="fw-bold mb-4">${q.question}</h5>
  `;

  if (q.type === 'choice') {
    html += `<div class="d-flex flex-column gap-2 mb-4">`;
    for (const [key, value] of Object.entries(q.options)) {
      if (value) {
        const isSelected = personalTestState.answers[qIdx] === key;
        html += `
          <button class="option-btn ${isSelected ? 'selected' : ''}" onclick="selectPersonalTestOption(${qIdx}, '${key}')">
            <strong>${key}.</strong> ${value}
          </button>
        `;
      }
    }
    html += `</div>`;
  } else {
    // Tự luận
    const val = personalTestState.answers[qIdx] || '';
    html += `
      <div class="mb-4">
        <label class="form-label text-secondary small">Nhập câu trả lời của bạn:</label>
        <textarea class="form-control bg-dark-glass text-light border-secondary" rows="5" oninput="savePersonalTestEssay(${qIdx}, this.value)" placeholder="Viết bài giải của bạn tại đây...">${val}</textarea>
      </div>
    `;
  }

  html += `
      </div>

      <div class="d-flex justify-content-between align-items-center border-top border-secondary pt-3 mt-4">
        <div>
          <button class="btn btn-outline-secondary rounded-pill px-3" onclick="navigatePersonalTest(${qIdx - 1})" ${qIdx === 0 ? 'disabled' : ''}>
            <i class="bi bi-chevron-left me-1"></i>Trước
          </button>
          <button class="btn btn-outline-secondary rounded-pill px-3 ms-2" onclick="navigatePersonalTest(${qIdx + 1})" ${qIdx === personalTestState.questions.length - 1 ? 'disabled' : ''}>
            Tiếp<i class="bi bi-chevron-right ms-1"></i>
          </button>
        </div>
        <button class="btn btn-danger rounded-pill px-4 fw-bold" onclick="submitPersonalTest()">
          <i class="bi bi-send-check me-2"></i>Nộp Bài Thi
        </button>
      </div>
    </div>

    <!-- Navigation grid of questions -->
    <div class="card glass-card border-secondary p-3">
      <h6 class="text-secondary small mb-2 text-start">Danh sách câu hỏi:</h6>
      <div class="d-flex flex-wrap gap-2">
  `;

  personalTestState.questions.forEach((_, idx) => {
    const isAnswered = personalTestState.answers[idx] !== undefined && personalTestState.answers[idx] !== '';
    const isActive = idx === qIdx;
    let btnClass = 'btn-dark-glass border-secondary';
    if (isAnswered) btnClass = 'btn-info text-dark';
    if (isActive) btnClass = 'btn-outline-info active';

    html += `
      <button class="btn btn-sm rounded-circle px-3 py-2 fw-semibold" style="width:40px; height:40px; display:inline-flex; align-items:center; justify-content:center;" onclick="navigatePersonalTest(${idx})">
        ${idx + 1}
      </button>
    `;
  });

  html += `
      </div>
    </div>
  `;

  runner.innerHTML = html;
}

function selectPersonalTestOption(qIdx, optionKey) {
  personalTestState.answers[qIdx] = optionKey;
  renderPersonalTestRunner(qIdx);
}

function savePersonalTestEssay(qIdx, text) {
  personalTestState.answers[qIdx] = text;
}

function navigatePersonalTest(targetIdx) {
  if (targetIdx >= 0 && targetIdx < personalTestState.questions.length) {
    renderPersonalTestRunner(targetIdx);
  }
}

function submitPersonalTest() {
  if (personalTestState.timer) {
    clearInterval(personalTestState.timer);
    personalTestState.timer = null;
  }

  // Chấm điểm phần Trắc nghiệm, phần Tự luận để đối chiếu sau
  let totalChoice = 0;
  let correctChoice = 0;
  let hasEssay = false;

  personalTestState.questions.forEach((q, idx) => {
    if (q.type === 'choice') {
      totalChoice++;
      if (personalTestState.answers[idx] === q.correct) {
        correctChoice++;
      }
    } else {
      hasEssay = true;
    }
  });

  let score = 0;
  if (totalChoice > 0) {
    score = parseFloat(((correctChoice / totalChoice) * 10).toFixed(1));
  } else {
    score = 'Tự luận (Cần đối chiếu)';
  }

  // Lưu kết quả thi tự luyện cá nhân
  const q0 = personalTestState.questions[0];
  const deptName = q0 && q0.deptId ? (departments[q0.deptId]?.name || 'Khoa ' + q0.deptId) : 'Cá nhân';
  const subObj = (q0 && q0.deptId && departments[q0.deptId]?.subjects) ? 
                 departments[q0.deptId].subjects.find(s => s.id === q0.subjectId) : null;
  const subjectName = subObj ? subObj.name : 'Môn học cá nhân';
  const departmentId = q0 && q0.deptId ? q0.deptId : 'personal';

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
  
  const newResult = {
    id: 'res_' + Date.now(),
    studentName: currentUser ? currentUser.name : 'Học viên ẩn danh',
    unit: [currentUser?.trungDoi, currentUser?.daiDoi, currentUser?.tieuDoan].filter(Boolean).join(' - ') || 'Tự do',
    trungDoi: currentUser?.trungDoi || '',
    daiDoi: currentUser?.daiDoi || '',
    tieuDoan: currentUser?.tieuDoan || '',
    departmentId: departmentId,
    departmentName: deptName,
    subjectName: subjectName,
    examYear: 'Tự luyện cá nhân',
    score: typeof score === 'number' ? score : 10.0,
    totalQuestions: personalTestState.questions.length,
    correctCount: correctChoice,
    date: dateStr
  };

  results.push(newResult);
  saveResults();

  // Render Kết quả bài thi
  const runner = document.getElementById('personal-test-runner');
  
  let html = `
    <div class="card glass-card border-secondary p-4 text-center mb-4">
      <i class="bi bi-trophy-fill text-warning fs-1 d-block mb-3"></i>
      <h3 class="h4 fw-bold text-light">KẾT QUẢ BÀI KIỂM TRA</h3>
      
      <div class="row justify-content-center my-4">
        <div class="col-6 col-md-4">
          <div class="p-3 bg-dark-glass rounded-4 border border-secondary">
            <span class="small text-secondary d-block">Điểm trắc nghiệm</span>
            <span class="fs-2 fw-bold text-info">${typeof score === 'number' ? score + '/10' : 'N/A'}</span>
          </div>
        </div>
        <div class="col-6 col-md-4">
          <div class="p-3 bg-dark-glass rounded-4 border border-secondary">
            <span class="small text-secondary d-block">Đúng (Trắc nghiệm)</span>
            <span class="fs-2 fw-bold text-success">${correctChoice}/${totalChoice}</span>
          </div>
        </div>
      </div>

      ${hasEssay ? `
        <div class="alert alert-warning-glass text-warning-light text-start p-3 my-3">
          <i class="bi bi-info-circle-fill me-2"></i>Bài kiểm tra có câu hỏi tự luận. Bạn vui lòng đối chiếu bài làm của bạn với đáp án mẫu chi tiết bên dưới.
        </div>
      ` : ''}

      <button class="btn btn-outline-info rounded-pill px-4" onclick="resetPersonalTestSetup()">
        Làm bài thi mới
      </button>
    </div>

    <h4 class="h5 fw-bold text-light mb-3 text-start">Xem lại chi tiết bài làm:</h4>
  `;

  personalTestState.questions.forEach((q, idx) => {
    const studentAns = personalTestState.answers[idx] || 'Chưa trả lời';
    const isCorrect = q.type === 'choice' && studentAns === q.correct;
    
    html += `
      <div class="card glass-card border-secondary p-3 mb-3 text-start">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="badge bg-secondary-glass text-secondary-light">Câu hỏi ${idx + 1}</span>
          <span class="badge ${q.type === 'choice' ? 'bg-primary-glass text-info' : 'bg-purple-glass text-purple-light'}">${q.type === 'choice' ? 'Trắc nghiệm' : 'Tự luận'}</span>
        </div>
        <h5 class="h6 fw-bold mb-3">${q.question}</h5>
    `;

    if (q.type === 'choice') {
      html += `
        <div class="small mb-3">
          <div class="p-2 rounded mb-1 ${studentAns === 'A' ? (isCorrect ? 'bg-success bg-opacity-25 text-success' : 'bg-danger bg-opacity-25 text-danger') : ''}">A. ${q.options.A}</div>
          <div class="p-2 rounded mb-1 ${studentAns === 'B' ? (isCorrect ? 'bg-success bg-opacity-25 text-success' : 'bg-danger bg-opacity-25 text-danger') : ''}">B. ${q.options.B}</div>
          <div class="p-2 rounded mb-1 ${studentAns === 'C' ? (isCorrect ? 'bg-success bg-opacity-25 text-success' : 'bg-danger bg-opacity-25 text-danger') : ''}">C. ${q.options.C}</div>
          <div class="p-2 rounded mb-1 ${studentAns === 'D' ? (isCorrect ? 'bg-success bg-opacity-25 text-success' : 'bg-danger bg-opacity-25 text-danger') : ''}">D. ${q.options.D}</div>
        </div>
        <div class="small p-2 bg-dark-glass rounded border border-secondary text-secondary">
          <strong class="${isCorrect ? 'text-success' : 'text-danger'}">${isCorrect ? 'ĐÚNG' : 'SAI'}:</strong> Đáp án đúng là <strong>${q.correct}</strong>. <br>
          <em>Giải thích:</em> ${q.explanation || 'Không có giải thích.'}
        </div>
      `;
    } else {
      // Tự luận review
      html += `
        <div class="small mb-3 p-2 bg-black-glass border border-secondary rounded">
          <strong>Bài làm của bạn:</strong> <br>
          <div class="text-light mt-1">${studentAns}</div>
        </div>
        <div class="small p-2 bg-dark-glass rounded border border-secondary text-secondary mb-2">
          <strong>Đáp án mẫu đối chiếu:</strong> <br>
          <div class="text-info mt-1">${q.sampleAnswer || 'Không có đáp án mẫu'}</div>
        </div>
        <div class="small p-2 bg-dark-glass rounded border border-secondary text-secondary">
          <em>Giải thích:</em> ${q.explanation || 'Không có giải thích.'}
        </div>
      `;
    }

    html += `</div>`;
  });

  runner.innerHTML = html;
}

// ============================================================================
// 6. PHÂN HỆ: HỆ THỐNG - K1 - K8 (SYSTEM VIEW LOGIC)
// ============================================================================
function renderSystem() {
  backToDepartments();
}

// Trở về danh sách 8 khoa K1-K8
function backToDepartments() {
  document.getElementById('system-departments-grid').classList.remove('d-none');
  document.getElementById('system-subjects-container').classList.add('d-none');
  document.getElementById('system-exams-container').classList.add('d-none');
  document.getElementById('system-exam-runner').classList.add('d-none');
  document.getElementById('system-breadcrumb').classList.add('d-none');
  
  // Hide Breadcrumb parts
  document.getElementById('bc-department').classList.add('d-none');
  document.getElementById('bc-sep-subject').classList.add('d-none');
  document.getElementById('bc-subject').classList.add('d-none');

  const grid = document.getElementById('system-departments-grid');
  grid.innerHTML = '';

  Object.entries(departments).forEach(([id, dept]) => {
    const cardCol = document.createElement('div');
    cardCol.className = 'col-12 col-md-6 col-lg-3';
    cardCol.innerHTML = `
      <div class="card glass-card border-secondary dept-card hover-glow-blue pointer p-3 text-start" style="--dept-color: ${dept.color}" onclick="selectDepartment('${id}')">
        <div class="dept-icon-wrapper" style="color: ${dept.color}">
          <i class="bi ${dept.icon}"></i>
        </div>
        <h4 class="h6 fw-bold text-light mb-1 text-wrap line-clamp-2" style="height:40px;">${dept.name}</h4>
        <span class="small text-secondary mt-2 d-block">${dept.subjects.length} Môn học chuyên ngành</span>
      </div>
    `;
    grid.appendChild(cardCol);
  });
}

function selectDepartment(deptId) {
  systemState.currentDeptId = deptId;
  
  // Hiển thị Breadcrumbs
  document.getElementById('system-breadcrumb').classList.remove('d-none');
  const bcDept = document.getElementById('bc-department');
  bcDept.innerText = departments[deptId].name;
  bcDept.classList.remove('d-none');

  loadSubjectsList();
}

// Tải danh sách môn học
function loadSubjectsList() {
  document.getElementById('system-departments-grid').classList.add('d-none');
  document.getElementById('system-subjects-container').classList.remove('d-none');
  document.getElementById('system-exams-container').classList.add('d-none');
  document.getElementById('system-exam-runner').classList.add('d-none');

  // Breadcrumbs
  document.getElementById('bc-sep-subject').classList.add('d-none');
  document.getElementById('bc-subject').classList.add('d-none');

  const dept = departments[systemState.currentDeptId];
  document.getElementById('current-dept-name').innerText = dept.name;

  // Quyền thêm môn học: Super Admin hoặc Giáo viên thuộc khoa này
  const addSubBtn = document.getElementById('add-subject-btn');
  if (currentUser.role === 'super_admin' || (currentUser.role === 'faculty_admin' && currentUser.department === systemState.currentDeptId)) {
    addSubBtn.classList.remove('d-none');
  } else {
    addSubBtn.classList.add('d-none');
  }

  const listContainer = document.getElementById('system-subjects-list');
  listContainer.innerHTML = '';

  if (dept.subjects.length === 0) {
    listContainer.innerHTML = `
      <div class="text-center py-5 text-secondary w-100">
        <i class="bi bi-journal-x fs-1 d-block mb-2"></i>
        Chưa có môn học nào thuộc khoa này.
      </div>
    `;
    return;
  }

  dept.subjects.forEach(sub => {
    const cardCol = document.createElement('div');
    cardCol.className = 'col-12 col-md-6';
    
    // Quyền chỉnh sửa môn học
    const hasEditPermission = currentUser.role === 'super_admin' || (currentUser.role === 'faculty_admin' && currentUser.department === systemState.currentDeptId);
    
    cardCol.innerHTML = `
      <div class="card glass-card bg-dark-glass border-secondary hover-glow-purple p-3 d-flex flex-row justify-content-between align-items-center pointer">
        <div onclick="selectSubject('${sub.id}')" class="flex-grow-1 text-start">
          <h4 class="h6 fw-bold text-light m-0"><i class="bi bi-journal-bookmark text-info me-2"></i>${sub.name}</h4>
          <span class="small text-secondary">${sub.exams.length} Đề thi qua các năm</span>
        </div>
        ${hasEditPermission ? `
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-info border-0 rounded-circle" onclick="openEditSubjectModal(event, '${sub.id}', '${sub.name}')" title="Sửa tên môn">
              <i class="bi bi-pencil-square"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger border-0 rounded-circle" onclick="deleteSubject(event, '${sub.id}')" title="Xóa môn học">
              <i class="bi bi-trash3"></i>
            </button>
          </div>
        ` : ''}
      </div>
    `;
    listContainer.appendChild(cardCol);
  });
}

function selectSubject(subId) {
  const dept = departments[systemState.currentDeptId];
  const sub = dept.subjects.find(s => s.id === subId);

  // Nếu là học viên và môn học có mật khẩu bảo mật
  if (currentUser && currentUser.role === 'student' && sub.password && !unlockedSubjects.includes(subId)) {
    const pw = prompt(`Môn học này yêu cầu mật khẩu truy cập từ giảng viên khoa ${systemState.currentDeptId}. Vui lòng nhập mật khẩu:`);
    if (pw === null) return; // Người dùng nhấn Hủy
    if (pw !== sub.password) {
      alert("Sai mật khẩu! Vui lòng liên hệ giảng viên hoặc quản trị viên khoa để lấy mật khẩu.");
      return;
    }
    unlockedSubjects.push(subId);
  }

  systemState.currentSubjectId = subId;

  // Nạp danh sách bình luận thảo luận
  if (typeof loadSubjectComments === 'function') {
    loadSubjectComments(subId);
  }

  // Hiển thị Breadcrumbs
  document.getElementById('bc-sep-subject').classList.remove('d-none');
  const bcSub = document.getElementById('bc-subject');
  bcSub.innerText = sub.name;
  bcSub.classList.remove('d-none');

  loadExamsList();
}

function backToSubjects() {
  loadSubjectsList();
}

// Tải danh sách bộ đề thi của môn học
function loadExamsList() {
  document.getElementById('system-subjects-container').classList.add('d-none');
  document.getElementById('system-exams-container').classList.remove('d-none');
  document.getElementById('system-exam-runner').classList.add('d-none');

  const dept = departments[systemState.currentDeptId];
  const sub = dept.subjects.find(s => s.id === systemState.currentSubjectId);
  document.getElementById('current-subject-name').innerText = sub.name;

  // Quyền thêm đề thi
  const addExamBtn = document.getElementById('add-exam-btn');
  if (currentUser.role === 'super_admin' || (currentUser.role === 'faculty_admin' && currentUser.department === systemState.currentDeptId)) {
    addExamBtn.classList.remove('d-none');
  } else {
    addExamBtn.classList.add('d-none');
  }

  const listContainer = document.getElementById('system-exams-list');
  listContainer.innerHTML = '';

  if (sub.exams.length === 0) {
    listContainer.innerHTML = `
      <div class="text-center py-5 text-secondary w-100">
        <i class="bi bi-clipboard2-minus fs-1 d-block mb-2"></i>
        Chưa có đề thi nào cho môn học này.
      </div>
    `;
    return;
  }

  sub.exams.forEach(ex => {
    const cardCol = document.createElement('div');
    cardCol.className = 'col-12 col-md-6';
    const isUploader = ex.uploader === currentUser.username;
    const hasEditPermission = currentUser.role === 'super_admin' || (currentUser.role === 'faculty_admin' && currentUser.department === systemState.currentDeptId);
    const canDelete = hasEditPermission || isUploader;

    cardCol.innerHTML = `
      <div class="card glass-card bg-dark-glass border-secondary p-3 text-start">
        <div class="d-flex justify-content-between align-items-start mb-3">
          <div>
            <h4 class="h6 fw-bold text-light m-0"><i class="bi bi-file-earmark-ruled text-warning me-2"></i>${ex.year}</h4>
            <span class="small text-secondary d-block mt-1">${ex.questions.length} câu hỏi (Trắc nghiệm / Tự luận)</span>
            ${ex.uploaderName ? `<span class="small text-info d-block mt-1"><i class="bi bi-person-fill me-1"></i>Đăng bởi: ${ex.uploaderName}</span>` : ''}
          </div>
          <div class="d-flex gap-1">
            ${hasEditPermission ? `
              <button class="btn btn-sm btn-outline-info border-0 rounded-circle" onclick="openEditExamModal(event, '${ex.id}')" title="Sửa đề thi">
                <i class="bi bi-pencil-square"></i>
              </button>
            ` : ''}
            ${canDelete ? `
              <button class="btn btn-sm btn-outline-danger border-0 rounded-circle" onclick="deleteExam(event, '${ex.id}')" title="Xóa đề thi">
                <i class="bi bi-trash3"></i>
              </button>
            ` : ''}
          </div>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-primary btn-sm rounded-pill px-3 flex-grow-1" onclick="startSystemExam('${ex.id}', false)">
            <i class="bi bi-stopwatch me-1"></i>Kiểm tra (Tính giờ)
          </button>
          <button class="btn btn-dark-glass btn-sm rounded-pill px-3 flex-grow-1" onclick="startSystemExam('${ex.id}', true)">
            <i class="bi bi-lightbulb me-1"></i>Luyện tập
          </button>
        </div>
      </div>
    `;
    listContainer.appendChild(cardCol);
  });
}

// --- 6.1 CRUD Môn học (Subject) ---
const subjectModal = new bootstrap.Modal(document.getElementById('subjectModal'));

function openAddSubjectModal() {
  document.getElementById('subject-modal-title').innerText = 'Thêm Môn Học Mới';
  document.getElementById('edit-subject-id').value = '';
  document.getElementById('subject-form').reset();
  subjectModal.show();
}

function openEditSubjectModal(event, subId, subName) {
  event.stopPropagation(); // Cản click vào môn học
  const dept = departments[systemState.currentDeptId];
  const sub = dept.subjects.find(s => s.id === subId);
  const password = sub.password || '';

  document.getElementById('subject-modal-title').innerText = 'Sửa Tên & Mật Khẩu Môn Học';
  document.getElementById('edit-subject-id').value = subId;
  document.getElementById('subject-input-name').value = subName;
  document.getElementById('subject-input-password').value = password;
  subjectModal.show();
}

function handleSaveSubject(event) {
  event.preventDefault();
  const subId = document.getElementById('edit-subject-id').value;
  const subName = document.getElementById('subject-input-name').value.trim();
  const subPassword = document.getElementById('subject-input-password').value.trim();
  const dept = departments[systemState.currentDeptId];

  if (subId) {
    // Chế độ Sửa
    const sub = dept.subjects.find(s => s.id === subId);
    if (sub) {
      sub.name = subName;
      sub.password = subPassword;
    }
  } else {
    // Chế độ Thêm mới
    dept.subjects.push({
      id: 'sub_' + Date.now(),
      name: subName,
      password: subPassword,
      exams: []
    });
  }

  saveDepartments();
  subjectModal.hide();
  loadSubjectsList();
}

function deleteSubject(event, subId) {
  event.stopPropagation();
  if (confirm('CẢNH BÁO: Xóa môn học này sẽ xóa toàn bộ các bộ đề thi bên trong môn. Bạn có chắc chắn muốn xóa?')) {
    const dept = departments[systemState.currentDeptId];
    dept.subjects = dept.subjects.filter(s => s.id !== subId);
    saveDepartments();
    loadSubjectsList();
  }
}

// --- 6.2 CRUD Đề thi (Exam) ---
const examModal = new bootstrap.Modal(document.getElementById('examModal'));
let examQuestionsDraft = [];

function openAddExamModal() {
  document.getElementById('exam-modal-title').innerText = 'Thêm Đề Thi Mới';
  document.getElementById('edit-exam-id').value = '';
  document.getElementById('exam-basic-form').reset();
  examQuestionsDraft = [];
  document.getElementById('exam-questions-form-container').innerHTML = '';
  document.getElementById('exam-q-counter').innerText = '0';
  
  // Khởi tạo trước 1 câu hỏi trống
  addNewQuestionToExamForm();
  examModal.show();
}

function openEditExamModal(event, examId) {
  event.stopPropagation();
  document.getElementById('exam-modal-title').innerText = 'Chỉnh Sửa Đề Thi';
  document.getElementById('edit-exam-id').value = examId;
  
  const dept = departments[systemState.currentDeptId];
  const sub = dept.subjects.find(s => s.id === systemState.currentSubjectId);
  const exam = sub.exams.find(e => e.id === examId);

  document.getElementById('exam-input-year').value = exam.year;
  examQuestionsDraft = JSON.parse(JSON.stringify(exam.questions)); // Deep copy draft

  renderExamQuestionsDraft();
  examModal.show();
}

function addNewQuestionToExamForm() {
  const newQ = {
    id: 'q_' + Date.now() + '_' + Math.floor(Math.random()*1000),
    type: 'choice',
    question: '',
    options: { A: '', B: '', C: '', D: '' },
    correct: 'A',
    sampleAnswer: '',
    barem: '',
    keywords: [],
    explanation: ''
  };
  examQuestionsDraft.push(newQ);
  renderExamQuestionsDraft();
}

function renderExamQuestionsDraft() {
  const container = document.getElementById('exam-questions-form-container');
  container.innerHTML = '';
  document.getElementById('exam-q-counter').innerText = examQuestionsDraft.length;

  examQuestionsDraft.forEach((q, idx) => {
    const qDiv = document.createElement('div');
    qDiv.className = 'p-3 bg-dark-glass rounded border border-secondary position-relative';
    qDiv.innerHTML = `
      <button type="button" class="btn btn-sm btn-outline-danger position-absolute top-0 end-0 m-2 border-0" onclick="removeQuestionFromExamDraft(${idx})" title="Xóa câu hỏi này">
        <i class="bi bi-trash-fill"></i>
      </button>
      <h6 class="fw-bold text-info small mb-3">Câu số ${idx + 1}</h6>
      
      <div class="row g-2 mb-2">
        <div class="col-12 col-md-4">
          <label class="form-label text-secondary small">Loại câu hỏi</label>
          <select class="form-select form-select-sm bg-dark-glass text-light border-secondary" onchange="updateDraftQType(${idx}, this.value)">
            <option value="choice" ${q.type === 'choice' ? 'selected' : ''}>Trắc nghiệm (4 đáp án)</option>
            <option value="essay" ${q.type === 'essay' ? 'selected' : ''}>Tự luận</option>
            <option value="interview" ${q.type === 'interview' ? 'selected' : ''}>Vấn đáp (Ghi âm / AI chấm)</option>
          </select>
        </div>
      </div>

      <div class="mb-2">
        <label class="form-label text-secondary small">Nội dung câu hỏi</label>
        <textarea class="form-control form-control-sm bg-dark-glass text-light border-secondary" rows="2" oninput="updateDraftQText(${idx}, this.value)" required>${q.question}</textarea>
      </div>

      <!-- Choice fields -->
      <div class="row g-2 mb-2 ${q.type !== 'choice' ? 'd-none' : ''}" id="draft-choice-${idx}">
        <div class="col-6">
          <label class="form-label text-secondary small">Lựa chọn A</label>
          <input type="text" class="form-control form-control-sm bg-dark-glass text-light border-secondary" value="${q.options.A || ''}" oninput="updateDraftQOption(${idx}, 'A', this.value)">
        </div>
        <div class="col-6">
          <label class="form-label text-secondary small">Lựa chọn B</label>
          <input type="text" class="form-control form-control-sm bg-dark-glass text-light border-secondary" value="${q.options.B || ''}" oninput="updateDraftQOption(${idx}, 'B', this.value)">
        </div>
        <div class="col-6">
          <label class="form-label text-secondary small">Lựa chọn C</label>
          <input type="text" class="form-control form-control-sm bg-dark-glass text-light border-secondary" value="${q.options.C || ''}" oninput="updateDraftQOption(${idx}, 'C', this.value)">
        </div>
        <div class="col-6">
          <label class="form-label text-secondary small">Lựa chọn D</label>
          <input type="text" class="form-control form-control-sm bg-dark-glass text-light border-secondary" value="${q.options.D || ''}" oninput="updateDraftQOption(${idx}, 'D', this.value)">
        </div>
        <div class="col-6 mt-2">
          <label class="form-label text-info small fw-bold">Đáp án đúng</label>
          <select class="form-select form-select-sm bg-dark-glass text-info border-secondary" onchange="updateDraftQCorrect(${idx}, this.value)">
            <option value="A" ${q.correct === 'A' ? 'selected' : ''}>A</option>
            <option value="B" ${q.correct === 'B' ? 'selected' : ''}>B</option>
            <option value="C" ${q.correct === 'C' ? 'selected' : ''}>C</option>
            <option value="D" ${q.correct === 'D' ? 'selected' : ''}>D</option>
          </select>
        </div>
      </div>

      <!-- Essay & Interview fields -->
      <div class="mb-2 ${q.type === 'choice' ? 'd-none' : ''}" id="draft-essay-${idx}">
        <div class="mb-2">
          <label class="form-label text-info small fw-bold">Đáp án mẫu / Gợi ý trả lời</label>
          <textarea class="form-control form-control-sm bg-dark-glass text-light border-secondary" rows="2" oninput="updateDraftQEssaySample(${idx}, this.value)">${q.sampleAnswer || ''}</textarea>
        </div>
        <div class="mb-2">
          <label class="form-label text-info small fw-bold">Barem điểm chi tiết (AI chấm dựa trên barem này)</label>
          <textarea class="form-control form-control-sm bg-dark-glass text-light border-secondary" rows="2" placeholder="Ví dụ:&#10;1. Nêu đúng định nghĩa: 4đ&#10;2. Giải thích ý nghĩa: 4đ&#10;3. Ví dụ: 2đ" oninput="updateDraftQBarem(${idx}, this.value)">${q.barem || ''}</textarea>
        </div>
        <div class="mb-2 ${q.type !== 'interview' ? 'd-none' : ''}">
          <label class="form-label text-secondary small fw-bold">Từ khóa cốt lõi (Cách nhau bằng dấu phẩy)</label>
          <input type="text" class="form-control form-control-sm bg-dark-glass text-light border-secondary" value="${q.keywords ? q.keywords.join(', ') : ''}" placeholder="Ví dụ: nạp chồng, ghi đè, overload, override" oninput="updateDraftQKeywords(${idx}, this.value)">
        </div>
      </div>

      <div>
        <label class="form-label text-secondary small">Giải thích chi tiết (Không bắt buộc)</label>
        <textarea class="form-control form-control-sm bg-dark-glass text-light border-secondary" rows="1.5" oninput="updateDraftQExplanation(${idx}, this.value)">${q.explanation || ''}</textarea>
      </div>
    `;
    container.appendChild(qDiv);
  });
}

function updateDraftQType(idx, val) {
  examQuestionsDraft[idx].type = val;
  renderExamQuestionsDraft();
}
function updateDraftQText(idx, val) {
  examQuestionsDraft[idx].question = val;
}
function updateDraftQOption(idx, optionKey, val) {
  examQuestionsDraft[idx].options[optionKey] = val;
}
function updateDraftQCorrect(idx, val) {
  examQuestionsDraft[idx].correct = val;
}
function updateDraftQEssaySample(idx, val) {
  examQuestionsDraft[idx].sampleAnswer = val;
}
function updateDraftQBarem(idx, val) {
  examQuestionsDraft[idx].barem = val;
}
function updateDraftQKeywords(idx, val) {
  examQuestionsDraft[idx].keywords = val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
}
function updateDraftQExplanation(idx, val) {
  examQuestionsDraft[idx].explanation = val;
}
function removeQuestionFromExamDraft(idx) {
  examQuestionsDraft.splice(idx, 1);
  renderExamQuestionsDraft();
}

function handleSaveExam() {
  const examId = document.getElementById('edit-exam-id').value;
  const examYear = document.getElementById('exam-input-year').value.trim();
  const sub = departments[systemState.currentDeptId].subjects.find(s => s.id === systemState.currentSubjectId);

  if (!examYear) {
    alert('Vui lòng nhập tên bộ đề thi!');
    return;
  }
  if (examQuestionsDraft.length === 0) {
    alert('Đề thi phải có ít nhất 1 câu hỏi!');
    return;
  }

  // Xác minh tính hợp lệ của câu hỏi
  for (let i = 0; i < examQuestionsDraft.length; i++) {
    const q = examQuestionsDraft[i];
    if (!q.question.trim()) {
      alert(`Câu hỏi số ${i + 1} đang bị bỏ trống nội dung!`);
      return;
    }
    if (q.type === 'choice') {
      if (!q.options.A.trim() || !q.options.B.trim()) {
        alert(`Câu hỏi trắc nghiệm số ${i + 1} phải có ít nhất đáp án A và B!`);
        return;
      }
    }
  }

  if (examId) {
    // Chỉnh sửa đề thi
    const exam = sub.exams.find(e => e.id === examId);
    exam.year = examYear;
    exam.questions = examQuestionsDraft;
  } else {
    // Tạo đề thi mới
    sub.exams.push({
      id: 'ex_' + Date.now(),
      year: examYear,
      questions: examQuestionsDraft
    });
  }

  saveDepartments();
  examModal.hide();
  loadExamsList();
  alert('Lưu bộ đề thi hệ thống thành công!');
}

function deleteExam(event, examId) {
  event.stopPropagation();
  const sub = departments[systemState.currentDeptId].subjects.find(s => s.id === systemState.currentSubjectId);
  const exam = sub ? sub.exams.find(e => e.id === examId) : null;
  if (!exam) return;

  const isUploader = exam.uploader === currentUser.username;
  const hasPermission = currentUser.role === 'super_admin' || 
                        (currentUser.role === 'faculty_admin' && currentUser.department === systemState.currentDeptId) || 
                        isUploader;

  if (!hasPermission) {
    alert('Bạn không có quyền xóa bộ đề thi này!');
    return;
  }

  if (confirm('Bạn có chắc chắn muốn xóa bộ đề thi này khỏi hệ thống?')) {
    sub.exams = sub.exams.filter(e => e.id !== examId);
    saveDepartments();
    loadExamsList();
  }
}

// --- 6.3 Chạy Đề thi Hệ thống ---
function startSystemExam(examId, practiceMode) {
  const dept = departments[systemState.currentDeptId];
  const sub = dept.subjects.find(s => s.id === systemState.currentSubjectId);
  const exam = sub.exams.find(e => e.id === examId);

  systemState.currentExamId = examId;
  systemState.practiceMode = practiceMode;
  systemState.questions = exam.questions;
  systemState.currentQIndex = 0;
  systemState.answers = {};
  systemState.checkedAnswers = {};
  systemState.submitted = false;

  document.getElementById('system-exams-container').classList.add('d-none');
  const runner = document.getElementById('system-exam-runner');
  runner.classList.remove('d-none');

  if (practiceMode) {
    renderSystemPracticeRunner();
  } else {
    // Chế độ thi tính giờ: mặc định cho 15 phút
    systemState.timeLeft = 15 * 60;
    renderSystemExamRunner();
    startSystemExamTimer();
  }
}

function startSystemExamTimer() {
  if (systemState.timer) clearInterval(systemState.timer);
  systemState.timer = setInterval(() => {
    systemState.timeLeft--;
    
    // Cập nhật hiển thị đồng hồ
    const timerDisplay = document.getElementById('system-exam-timer');
    if (timerDisplay) {
      const minutes = Math.floor(systemState.timeLeft / 60);
      const seconds = systemState.timeLeft % 60;
      timerDisplay.innerText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      
      if (systemState.timeLeft <= 30) {
        timerDisplay.className = 'badge bg-danger fs-5 pulse';
      }
    }

    if (systemState.timeLeft <= 0) {
      clearInterval(systemState.timer);
      alert('Đã hết giờ làm bài kiểm tra! Hệ thống tiến hành nộp bài tự động.');
      triggerSubmitExamModal();
    }
  }, 1000);
}

// --- RENDERING CHẾ ĐỘ LUYỆN TẬP HỆ THỐNG ---
function renderSystemPracticeRunner() {
  const runner = document.getElementById('system-exam-runner');
  const qIdx = systemState.currentQIndex;
  const q = systemState.questions[qIdx];
  const dept = departments[systemState.currentDeptId];
  const sub = dept.subjects.find(s => s.id === systemState.currentSubjectId);
  const exam = sub.exams.find(e => e.id === systemState.currentExamId);

  let html = `
    <div class="card glass-card border-secondary p-4 mb-4">
      <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4 pb-2 border-bottom border-secondary">
        <div>
          <span class="badge bg-secondary-glass text-secondary-light mb-1">Luyện tập Hệ thống</span>
          <h4 class="h5 fw-bold text-light m-0">${sub.name} - ${exam.year}</h4>
        </div>
        <span class="badge bg-secondary-glass text-secondary-light">Câu hỏi ${qIdx + 1} của ${systemState.questions.length}</span>
      </div>

      <div class="question-body text-start">
        <h5 class="fw-bold mb-4">${q.question}</h5>
  `;

  const isChecked = systemState.checkedAnswers[qIdx] === true;

  if (q.type === 'choice') {
    html += `<div class="d-flex flex-column gap-2 mb-4">`;
    for (const [key, value] of Object.entries(q.options)) {
      if (value) {
        const isSelected = systemState.answers[qIdx] === key;
        let optClass = '';
        
        if (isChecked) {
          if (key === q.correct) {
            optClass = 'correct';
          } else if (isSelected) {
            optClass = 'wrong';
          }
        } else if (isSelected) {
          optClass = 'selected';
        }

        html += `
          <button class="option-btn ${optClass}" onclick="selectSystemPracticeOption(${qIdx}, '${key}')" ${isChecked ? 'disabled' : ''}>
            <strong>${key}.</strong> ${value}
          </button>
        `;
      }
    }
    html += `</div>
      <div class="d-flex justify-content-between align-items-center mt-3">
        <button class="btn btn-info text-dark rounded-pill px-4 fw-bold" onclick="checkSystemPracticeAnswer(${qIdx})" ${isChecked ? 'disabled' : ''}>
          Kiểm tra đáp án
        </button>
      </div>
    `;
  } else if (q.type === 'essay') {
    // Tự luận
    const studentEssay = systemState.answers[qIdx] || '';
    html += `
      <div class="mb-4">
        <label class="form-label text-secondary small">Nhập câu trả lời của bạn:</label>
        <textarea class="form-control bg-dark-glass text-light border-secondary" rows="4" placeholder="Nhập bài giải của bạn..." oninput="saveSystemPracticeEssay(${qIdx}, this.value)" ${isChecked ? 'readonly' : ''}>${studentEssay}</textarea>
      </div>
      <div class="d-flex justify-content-between align-items-center">
        <button class="btn btn-info text-dark rounded-pill px-4 fw-bold" onclick="checkSystemPracticeAnswer(${qIdx})" ${isChecked ? 'disabled' : ''}>
          Xem đáp án mẫu
        </button>
      </div>
    `;
  } else {
    // Vấn đáp (interview)
    const studentAns = systemState.answers[qIdx] || '';
    html += `
      <div class="mb-4">
        <label class="form-label text-secondary small">Trả lời vấn đáp (Nói hoặc Nhập văn bản):</label>
        <textarea class="form-control bg-dark-glass text-light border-secondary mb-3" id="system-ans-${qIdx}" rows="4" placeholder="Nội dung giọng nói của bạn sẽ hiển thị ở đây..." oninput="saveSystemPracticeEssay(${qIdx}, this.value)" ${isChecked ? 'readonly' : ''}>${studentAns}</textarea>
        
        <div class="mic-btn-container ${isChecked ? 'd-none' : ''}">
          <button type="button" class="mic-btn" id="sys-mic-btn-${qIdx}" onclick="toggleSpeechRecognition(${qIdx}, 'sys-mic-btn-${qIdx}', 'system-ans-${qIdx}')">
            <i class="bi bi-mic-fill"></i>
          </button>
          <div class="sound-waves" id="waves-${qIdx}">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <span class="small text-secondary mt-2" id="sys-mic-status-${qIdx}">Nhấp để bắt đầu nói</span>
        </div>
      </div>

      <div class="d-flex justify-content-between align-items-center">
        <button class="btn btn-info text-dark rounded-pill px-4 fw-bold" id="sys-ai-grade-btn-${qIdx}" onclick="checkSystemPracticeInterview(${qIdx})" ${isChecked ? 'disabled' : ''}>
          <i class="bi bi-robot me-1"></i>AI Chấm Điểm
        </button>
      </div>

      <!-- Thẻ kết quả AI -->
      <div class="mt-4 p-4 rounded-3 border border-secondary bg-black-glass d-none text-start" id="sys-ai-result-card-${qIdx}">
        <div class="ai-score-circle score-high" id="sys-ai-score-circle-${qIdx}">
          <span class="ai-score-value text-info" id="sys-ai-score-val-${qIdx}">0</span>
          <span class="ai-score-label">Điểm số</span>
        </div>
        <div class="mb-3">
          <strong class="text-info d-block mb-1 small"><i class="bi bi-card-checklist me-1"></i>Phân tích Barem Điểm:</strong>
          <div class="p-2.5 rounded bg-dark-glass border border-secondary text-secondary small text-wrap" id="sys-ai-barem-breakdown-${qIdx}">...</div>
        </div>
        <div class="row g-2 mb-3">
          <div class="col-6">
            <div class="p-2 rounded bg-dark-glass border border-secondary text-start">
              <span class="text-secondary d-block small">Trôi chảy</span>
              <span class="text-light small" id="sys-ai-fluency-${qIdx}">...</span>
            </div>
          </div>
          <div class="col-6">
            <div class="p-2 rounded bg-dark-glass border border-secondary text-start">
              <span class="text-secondary d-block small">Chính xác</span>
              <span class="text-light small" id="sys-ai-accuracy-${qIdx}">...</span>
            </div>
          </div>
        </div>
        <div>
          <strong class="text-success d-block mb-1 small"><i class="bi bi-chat-left-dots me-1"></i>Lời khuyên của AI:</strong>
          <p class="text-secondary small m-0" id="sys-ai-feedback-${qIdx}">...</p>
        </div>
      </div>
    `;
  }

  // Vùng giải thích
  html += `
    <div class="mt-4 p-3 rounded-3 border border-secondary bg-dark-glass ${isChecked ? '' : 'd-none'}" id="system-practice-exp">
      <div class="fw-bold mb-1 text-info text-start"><i class="bi bi-info-circle me-1"></i>Giải thích từ hệ thống:</div>
      <div class="text-start mb-2 text-success small">
        ${q.type === 'choice' ? `Đáp án đúng là: <strong>${q.correct}</strong>` : `Đáp án mẫu: <div class="p-2 bg-black-glass text-light rounded-3 mt-1 small">${q.sampleAnswer || 'Không có đáp án mẫu'}</div>`}
      </div>
      <p class="text-secondary small m-0 text-start">${q.explanation || 'Không có giải thích chi tiết.'}</p>
    </div>
  `;

  html += `
      </div>

      <div class="d-flex justify-content-between align-items-center border-top border-secondary pt-3 mt-4">
        <div>
          <button class="btn btn-outline-secondary rounded-pill px-3" onclick="navigateSystemPractice(${qIdx - 1})" ${qIdx === 0 ? 'disabled' : ''}>
            <i class="bi bi-chevron-left me-1"></i>Trước
          </button>
          <button class="btn btn-outline-secondary rounded-pill px-3 ms-2" onclick="navigateSystemPractice(${qIdx + 1})" ${qIdx === systemState.questions.length - 1 ? 'disabled' : ''}>
            Tiếp<i class="bi bi-chevron-right ms-1"></i>
          </button>
        </div>
        <button class="btn btn-outline-light rounded-pill px-3" onclick="loadExamsList()">
          Thoát luyện tập
        </button>
      </div>
    </div>

    <!-- Navigation grid of questions -->
    <div class="card glass-card border-secondary p-3">
      <h6 class="text-secondary small mb-2 text-start">Danh sách câu hỏi:</h6>
      <div class="d-flex flex-wrap gap-2">
  `;

  systemState.questions.forEach((_, idx) => {
    const isAnswered = systemState.answers[idx] !== undefined && systemState.answers[idx] !== '';
    const isActive = idx === qIdx;
    let btnClass = 'btn-dark-glass border-secondary';
    if (isAnswered) btnClass = 'btn-info text-dark';
    if (isActive) btnClass = 'btn-outline-info active';

    html += `
      <button class="btn btn-sm rounded-circle px-3 py-2 fw-semibold" style="width:40px; height:40px; display:inline-flex; align-items:center; justify-content:center;" onclick="navigateSystemPractice(${idx})">
        ${idx + 1}
      </button>
    `;
  });

  html += `
      </div>
    </div>
  `;

  runner.innerHTML = html;
}

function selectSystemPracticeOption(qIdx, key) {
  systemState.answers[qIdx] = key;
  renderSystemPracticeRunner();
}

function saveSystemPracticeEssay(qIdx, text) {
  systemState.answers[qIdx] = text;
}

function checkSystemPracticeAnswer(qIdx) {
  const q = systemState.questions[qIdx];
  if (q.type === 'choice' && !systemState.answers[qIdx]) {
    alert('Vui lòng lựa chọn một đáp án!');
    return;
  }
  systemState.checkedAnswers[qIdx] = true;
  renderSystemPracticeRunner();
}

function navigateSystemPractice(targetIdx) {
  if (targetIdx >= 0 && targetIdx < systemState.questions.length) {
    systemState.currentQIndex = targetIdx;
    renderSystemPracticeRunner();
  }
}

// --- RENDERING CHẾ ĐỘ THI CÓ TÍNH GIỜ ---
function renderSystemExamRunner() {
  const runner = document.getElementById('system-exam-runner');
  const qIdx = systemState.currentQIndex;
  const q = systemState.questions[qIdx];
  const dept = departments[systemState.currentDeptId];
  const sub = dept.subjects.find(s => s.id === systemState.currentSubjectId);
  const exam = sub.exams.find(e => e.id === systemState.currentExamId);

  const minutes = Math.floor(systemState.timeLeft / 60);
  const seconds = systemState.timeLeft % 60;

  let html = `
    <div class="card glass-card border-secondary p-4 mb-4">
      <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4 pb-2 border-bottom border-secondary">
        <div>
          <span class="badge bg-danger-glass text-warning-light mb-1"><i class="bi bi-clock-history me-1"></i>KIỂM TRA TÍNH GIỜ</span>
          <h4 class="h5 fw-bold text-light m-0">${sub.name} - ${exam.year}</h4>
        </div>
        <div class="d-flex align-items-center gap-3">
          <span class="badge bg-secondary-glass text-secondary-light">Câu hỏi ${qIdx + 1} của ${systemState.questions.length}</span>
          <span class="badge bg-dark-glass border-secondary fs-5 text-info" id="system-exam-timer">
            ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}
          </span>
        </div>
      </div>

      <div class="question-body text-start">
        <h5 class="fw-bold mb-4">${q.question}</h5>
  `;

  if (q.type === 'choice') {
    html += `<div class="d-flex flex-column gap-2 mb-4">`;
    for (const [key, value] of Object.entries(q.options)) {
      if (value) {
        const isSelected = systemState.answers[qIdx] === key;
        html += `
          <button class="option-btn ${isSelected ? 'selected' : ''}" onclick="selectSystemExamOption(${qIdx}, '${key}')">
            <strong>${key}.</strong> ${value}
          </button>
        `;
      }
    }
    html += `</div>`;
  } else if (q.type === 'essay') {
    // Tự luận
    const studentAns = systemState.answers[qIdx] || '';
    html += `
      <div class="mb-4">
        <label class="form-label text-secondary small">Nhập câu trả lời tự luận:</label>
        <textarea class="form-control bg-dark-glass text-light border-secondary" rows="5" oninput="saveSystemExamEssay(${qIdx}, this.value)" placeholder="Nhập bài giải tự luận tại đây...">${studentAns}</textarea>
      </div>
    `;
  } else {
    // Vấn đáp (interview)
    const studentAns = systemState.answers[qIdx] || '';
    html += `
      <div class="mb-4">
        <label class="form-label text-secondary small">Trả lời vấn đáp (Nói hoặc Nhập văn bản):</label>
        <textarea class="form-control bg-dark-glass text-light border-secondary mb-3" id="system-ans-${qIdx}" rows="4" placeholder="Nội dung giọng nói của bạn sẽ hiển thị ở đây..." oninput="saveSystemExamEssay(${qIdx}, this.value)">${studentAns}</textarea>
        
        <div class="mic-btn-container">
          <button type="button" class="mic-btn" id="sys-mic-btn-${qIdx}" onclick="toggleSpeechRecognition(${qIdx}, 'sys-mic-btn-${qIdx}', 'system-ans-${qIdx}')">
            <i class="bi bi-mic-fill"></i>
          </button>
          <div class="sound-waves" id="waves-${qIdx}">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <span class="small text-secondary mt-2" id="sys-mic-status-${qIdx}">Nhấp để bắt đầu nói</span>
        </div>
      </div>
    `;
  }

  html += `
      </div>

      <div class="d-flex justify-content-between align-items-center border-top border-secondary pt-3 mt-4">
        <div>
          <button class="btn btn-outline-secondary rounded-pill px-3" onclick="navigateSystemExam(${qIdx - 1})" ${qIdx === 0 ? 'disabled' : ''}>
            <i class="bi bi-chevron-left me-1"></i>Trước
          </button>
          <button class="btn btn-outline-secondary rounded-pill px-3 ms-2" onclick="navigateSystemExam(${qIdx + 1})" ${qIdx === systemState.questions.length - 1 ? 'disabled' : ''}>
            Tiếp<i class="bi bi-chevron-right ms-1"></i>
          </button>
        </div>
        <button class="btn btn-danger rounded-pill px-4 fw-bold shadow" onclick="triggerSubmitExamModal()">
          <i class="bi bi-send-check me-2"></i>Nộp Bài Thi
        </button>
      </div>
    </div>

    <!-- Navigation grid of questions -->
    <div class="card glass-card border-secondary p-3">
      <h6 class="text-secondary small mb-2 text-start">Danh sách câu hỏi:</h6>
      <div class="d-flex flex-wrap gap-2">
  `;

  systemState.questions.forEach((_, idx) => {
    const isAnswered = systemState.answers[idx] !== undefined && systemState.answers[idx] !== '';
    const isActive = idx === qIdx;
    let btnClass = 'btn-dark-glass border-secondary';
    if (isAnswered) btnClass = 'btn-info text-dark';
    if (isActive) btnClass = 'btn-outline-info active';

    html += `
      <button class="btn btn-sm rounded-circle px-3 py-2 fw-semibold" style="width:40px; height:40px; display:inline-flex; align-items:center; justify-content:center;" onclick="navigateSystemExam(${idx})">
        ${idx + 1}
      </button>
    `;
  });

  html += `
      </div>
    </div>
  `;

  runner.innerHTML = html;
}

function selectSystemExamOption(qIdx, key) {
  systemState.answers[qIdx] = key;
  renderSystemExamRunner();
}

function saveSystemExamEssay(qIdx, text) {
  systemState.answers[qIdx] = text;
}

function navigateSystemExam(targetIdx) {
  if (targetIdx >= 0 && targetIdx < systemState.questions.length) {
    systemState.currentQIndex = targetIdx;
    renderSystemExamRunner();
  }
}

function triggerSubmitExamModal() {
  if (confirm("Bạn có chắc chắn muốn nộp bài thi và lưu kết quả?")) {
    submitSystemExamDirectly();
  }
}

async function submitSystemExamDirectly() {
  if (systemState.timer) {
    clearInterval(systemState.timer);
    systemState.timer = null;
  }

  // Tự động lấy thông tin từ tài khoản đang đăng nhập
  const name = currentUser ? currentUser.name : 'Học viên ẩn danh';
  const trungDoi = (currentUser && currentUser.trungDoi) ? currentUser.trungDoi : '';
  const daiDoi = (currentUser && currentUser.daiDoi) ? currentUser.daiDoi : '';
  const tieuDoan = (currentUser && currentUser.tieuDoan) ? currentUser.tieuDoan : '';
  const unit = [trungDoi, daiDoi, tieuDoan].filter(Boolean).join(' - ') || 'Tự do';

  // Hiển thị màn hình chờ chấm điểm AI
  const runner = document.getElementById('system-exam-runner');
  runner.innerHTML = `
    <div class="card glass-card border-secondary p-5 text-center my-5">
      <div class="spinner-border text-info mb-4" style="width: 3rem; height: 3rem;" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <h4 class="text-light fw-bold">HỆ THỐNG AI ĐANG CHẤM BÀI THI</h4>
      <p class="text-secondary small max-w-500 mx-auto">Vui lòng không tắt trình duyệt. Hệ thống AI đang đối chiếu bài làm vấn đáp của bạn với Barem điểm chi tiết...</p>
    </div>
  `;

  // Chấm điểm từng câu
  let totalScore = 0;
  let correctChoice = 0;
  let totalChoice = 0;
  systemState.aiEvaluationResults = {};

  for (let idx = 0; idx < systemState.questions.length; idx++) {
    const q = systemState.questions[idx];
    const studentAns = systemState.answers[idx] || '';

    if (q.type === 'choice') {
      totalChoice++;
      if (studentAns === q.correct) {
        correctChoice++;
        totalScore += 10;
      }
    } else if (q.type === 'interview') {
      // Vấn đáp AI chấm điểm theo barem
      const aiResult = await evaluateAnswerWithAI(q.question, q.sampleAnswer || '', q.barem || '', studentAns, q.keywords || []);
      systemState.aiEvaluationResults[idx] = aiResult;
      totalScore += parseFloat(aiResult.score);
    } else if (q.type === 'essay') {
      // Tự luận (chấm bằng AI nếu có barem, ngược lại tính trung bình đạt 10 để tự đối chiếu)
      if (q.barem) {
        const aiResult = await evaluateAnswerWithAI(q.question, q.sampleAnswer || '', q.barem || '', studentAns, []);
        systemState.aiEvaluationResults[idx] = aiResult;
        totalScore += parseFloat(aiResult.score);
      } else {
        totalScore += 10; // Không có barem thì mặc định 10 và xem đáp án mẫu để tự so sánh
      }
    }
  }

  const finalScore = parseFloat((totalScore / systemState.questions.length).toFixed(1));

  const dept = departments[systemState.currentDeptId];
  const sub = dept.subjects.find(s => s.id === systemState.currentSubjectId);
  const exam = sub.exams.find(e => e.id === systemState.currentExamId);

  // Tạo tệp ghi nhận điểm
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
  
  const newResult = {
    id: 'res_' + Date.now(),
    studentName: name,
    unit: unit,
    trungDoi: trungDoi,
    daiDoi: daiDoi,
    tieuDoan: tieuDoan,
    departmentId: systemState.currentDeptId,
    departmentName: dept.name,
    subjectName: sub.name,
    examYear: exam ? (exam.year || exam.name || 'Đề thi hệ thống') : 'Đề thi hệ thống',
    score: finalScore,
    totalQuestions: systemState.questions.length,
    correctCount: correctChoice,
    date: dateStr,
    aiEvaluationResults: systemState.aiEvaluationResults // Lưu chi tiết chấm AI
  };

  // Lưu điểm vào Database
  results.push(newResult);
  saveResults();

  // Hiện trang kết quả tổng hợp
  showSystemExamResultPage(finalScore, correctChoice, totalChoice);
}

function showSystemExamResultPage(score, correctChoice, totalChoice) {
  systemState.submitted = true;
  const runner = document.getElementById('system-exam-runner');
  
  let hasEssay = systemState.questions.some(q => q.type === 'essay');
  let hasInterview = systemState.questions.some(q => q.type === 'interview');

  let html = `
    <div class="card glass-card border-secondary p-4 text-center mb-4">
      <i class="bi bi-check-circle-fill text-success fs-1 d-block mb-3"></i>
      <h3 class="h4 fw-bold text-light">ĐÃ NỘP BÀI THÀNH CÔNG</h3>
      <p class="text-secondary small">Điểm thi của bạn đã được ghi nhận vào hệ thống.</p>
      
      <div class="row justify-content-center my-4">
        <div class="col-6 col-md-4">
          <div class="p-3 bg-dark-glass rounded-4 border border-secondary">
            <span class="small text-secondary d-block">Điểm thi tổng kết</span>
            <span class="fs-2 fw-bold text-info">${score}/10</span>
          </div>
        </div>
        <div class="col-6 col-md-4">
          <div class="p-3 bg-dark-glass rounded-4 border border-secondary">
            <span class="small text-secondary d-block">Đúng (Trắc nghiệm)</span>
            <span class="fs-2 fw-bold text-success">${correctChoice}/${totalChoice}</span>
          </div>
        </div>
      </div>

      ${hasInterview ? `
        <div class="alert alert-success bg-success bg-opacity-10 border-success text-success p-3 my-3 text-start small d-flex gap-2">
          <i class="bi bi-robot fs-5"></i>
          <div>
            <strong>Chấm điểm Vấn đáp bằng AI:</strong> Bài thi vấn đáp của bạn đã được chấm tự động thông qua trí tuệ nhân tạo. Bạn hãy xem giải trình Barem chi tiết ở từng câu bên dưới.
          </div>
        </div>
      ` : ''}

      ${hasEssay && !hasInterview ? `
        <div class="alert alert-warning-glass text-warning-light text-start p-3 my-3">
          <i class="bi bi-info-circle-fill me-2"></i>Bộ đề có câu hỏi tự luận. Đáp án chi tiết và đáp án mẫu được hiển thị phía dưới để bạn tự đối chiếu.
        </div>
      ` : ''}

      <button class="btn btn-outline-info rounded-pill px-4" onclick="loadExamsList()">
        Quay lại Danh sách Đề thi
      </button>
    </div>

    <h4 class="h5 fw-bold text-light mb-3 text-start">Xem lại đáp án chi tiết:</h4>
  `;

  systemState.questions.forEach((q, idx) => {
    const studentAns = systemState.answers[idx] || 'Chưa làm';
    const isCorrect = q.type === 'choice' && studentAns === q.correct;
    
    let typeText = 'Tự luận';
    let typeClass = 'bg-purple-glass text-purple-light';
    if (q.type === 'choice') {
      typeText = 'Trắc nghiệm';
      typeClass = 'bg-primary-glass text-info';
    } else if (q.type === 'interview') {
      typeText = 'Vấn đáp AI';
      typeClass = 'bg-danger-glass text-warning-light';
    }

    html += `
      <div class="card glass-card border-secondary p-3 mb-3 text-start">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="badge bg-secondary-glass text-secondary-light">Câu hỏi ${idx + 1}</span>
          <span class="badge ${typeClass}">${typeText}</span>
        </div>
        <h5 class="h6 fw-bold mb-3">${q.question}</h5>
    `;

    if (q.type === 'choice') {
      html += `
        <div class="small mb-3">
          <div class="p-2 rounded mb-1 ${studentAns === 'A' ? (isCorrect ? 'bg-success bg-opacity-25 text-success' : 'bg-danger bg-opacity-25 text-danger') : ''}">A. ${q.options.A}</div>
          <div class="p-2 rounded mb-1 ${studentAns === 'B' ? (isCorrect ? 'bg-success bg-opacity-25 text-success' : 'bg-danger bg-opacity-25 text-danger') : ''}">B. ${q.options.B}</div>
          <div class="p-2 rounded mb-1 ${studentAns === 'C' ? (isCorrect ? 'bg-success bg-opacity-25 text-success' : 'bg-danger bg-opacity-25 text-danger') : ''}">C. ${q.options.C}</div>
          <div class="p-2 rounded mb-1 ${studentAns === 'D' ? (isCorrect ? 'bg-success bg-opacity-25 text-success' : 'bg-danger bg-opacity-25 text-danger') : ''}">D. ${q.options.D}</div>
        </div>
        <div class="small p-2 bg-dark-glass rounded border border-secondary text-secondary">
          <strong class="${isCorrect ? 'text-success' : 'text-danger'}">${isCorrect ? 'ĐÚNG' : 'SAI'}:</strong> Đáp án đúng là <strong>${q.correct}</strong>. <br>
          <em>Giải thích:</em> ${q.explanation || 'Không có giải thích.'}
        </div>
      `;
    } else {
      // Tự luận & Vấn đáp review
      html += `
        <div class="small mb-3 p-2 bg-black-glass border border-secondary rounded">
          <strong>Bài làm của bạn:</strong> <br>
          <div class="text-light mt-1">${studentAns}</div>
        </div>
        <div class="small p-2 bg-dark-glass rounded border border-secondary text-secondary mb-2">
          <strong>Đáp án mẫu đối chiếu:</strong> <br>
          <div class="text-info mt-1">${q.sampleAnswer || 'Không có đáp án mẫu'}</div>
        </div>
        ${q.barem ? `
          <div class="small p-2 bg-dark-glass rounded border border-secondary text-secondary mb-2">
            <strong>Barem điểm do giáo viên lập:</strong> <br>
            <div class="text-warning-light mt-1 small" style="white-space: pre-line;">${q.barem}</div>
          </div>
        ` : ''}
        <div class="small p-2 bg-dark-glass rounded border border-secondary text-secondary mb-2">
          <em>Giải thích thêm:</em> ${q.explanation || 'Không có giải thích.'}
        </div>
      `;

      // Hiển thị kết quả AI chấm nếu có
      if (systemState.aiEvaluationResults && systemState.aiEvaluationResults[idx]) {
        const aiRes = systemState.aiEvaluationResults[idx];
        html += `
          <div class="mt-3 p-3 rounded bg-black-glass border border-secondary">
            <div class="d-flex align-items-center gap-2 mb-2 pb-1 border-bottom border-secondary">
              <span class="badge bg-danger-glass text-warning-light"><i class="bi bi-robot"></i> Đánh giá từ AI</span>
              <span class="fw-bold text-info ms-auto">Điểm AI: ${aiRes.score}/10</span>
            </div>
            <div class="mb-2 text-secondary small">
              <strong>Phân tích Barem Điểm:</strong>
              <div class="p-2 rounded bg-dark-glass border border-secondary text-light mt-1" style="white-space: pre-line;">${aiRes.barem_breakdown || 'Không có'}</div>
            </div>
            <div class="row g-2 mb-2 small text-start">
              <div class="col-6">
                <div class="p-2 rounded bg-dark-glass border border-secondary">
                  <span class="text-secondary d-block small">Trôi chảy</span>
                  <span class="text-light">${aiRes.fluency || 'Không có'}</span>
                </div>
              </div>
              <div class="col-6">
                <div class="p-2 rounded bg-dark-glass border border-secondary">
                  <span class="text-secondary d-block small">Chính xác</span>
                  <span class="text-light">${aiRes.accuracy || 'Không có'}</span>
                </div>
              </div>
            </div>
            <div class="text-secondary small">
              <strong>Lời khuyên của AI:</strong> <span class="text-success">${aiRes.feedback || 'Không có'}</span>
            </div>
          </div>
        `;
      }
    }

    html += `</div>`;
  });

  runner.innerHTML = html;
}

// ============================================================================
// 7. XEM KẾT QUẢ THI (RESULTS VIEW LOGIC)
// ============================================================================
function renderResults() {
  // Đặt giá trị ban đầu cho bộ lọc Khoa dựa trên vai trò
  const deptSelect = document.getElementById('results-filter-dept');
  if (currentUser.role === 'faculty_admin') {
    deptSelect.value = currentUser.department;
    deptSelect.disabled = true;
    selectedResultDept = currentUser.department;
  } else {
    deptSelect.disabled = false;
    // Giữ nguyên giá trị cũ hoặc đặt mặc định 'all'
    if (!selectedResultDept) selectedResultDept = 'all';
    deptSelect.value = selectedResultDept;
  }

  // Cập nhật danh sách môn học dựa trên khoa đang chọn
  updateFilterSubjects();
  
  // Hiển thị/ẩn nút xóa toàn bộ kết quả cho super_admin
  const clearAllBtn = document.getElementById('clear-all-results-btn');
  if (clearAllBtn) {
    if (currentUser.role === 'super_admin') {
      clearAllBtn.classList.remove('d-none');
    } else {
      clearAllBtn.classList.add('d-none');
    }
  }

  loadResultsUnits();
  loadResultsTable();
}

// Cập nhật dropdown môn học dựa trên khoa đang chọn
function updateFilterSubjects() {
  const deptVal = selectedResultDept;
  const subjectSelect = document.getElementById('results-filter-subject');
  subjectSelect.innerHTML = '<option value="all">Tất cả Môn học</option>';

  if (deptVal !== 'all') {
    const dept = departments[deptVal];
    if (dept && dept.subjects) {
      dept.subjects.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub.name;
        opt.innerText = sub.name;
        subjectSelect.appendChild(opt);
      });
    }
  }
  
  if (selectedResultSubject) {
    subjectSelect.value = selectedResultSubject;
  } else {
    selectedResultSubject = 'all';
  }
}

// Khi thay đổi Khoa
function onFilterDeptChange() {
  selectedResultDept = document.getElementById('results-filter-dept').value;
  selectedResultSubject = 'all';
  selectedResultUnit = 'all';
  updateFilterSubjects();
  loadResultsUnits();
  loadResultsTable();
}

// Khi thay đổi Môn học
function onFilterSubjectChange() {
  selectedResultSubject = document.getElementById('results-filter-subject').value;
  selectedResultUnit = 'all';
  loadResultsUnits();
  loadResultsTable();
}

// Tải danh sách đơn vị (được lọc theo Khoa và Môn học)
function loadResultsUnits() {
  const container = document.getElementById('results-units-list');
  container.innerHTML = '';

  // Lọc kết quả theo Khoa và Môn học đang chọn
  let filtered = results;
  
  if (selectedResultDept !== 'all') {
    filtered = filtered.filter(r => r.departmentId === selectedResultDept);
  }
  
  if (selectedResultSubject !== 'all') {
    filtered = filtered.filter(r => r.subjectName === selectedResultSubject);
  }

  // Trích xuất các Đơn vị duy nhất
  const units = [...new Set(filtered.map(r => r.unit))].filter(Boolean);

  // Nút hiển thị "Tất cả đơn vị"
  const allDiv = document.createElement('div');
  allDiv.className = `p-2.5 px-3 rounded-pill bg-dark-glass border pointer text-start text-truncate small ${selectedResultUnit === 'all' ? 'border-info text-info' : 'border-secondary'}`;
  allDiv.innerHTML = `<i class="bi bi-globe me-2"></i>Tất cả đơn vị`;
  allDiv.onclick = () => selectResultUnit('all');
  container.appendChild(allDiv);

  units.forEach(u => {
    const uDiv = document.createElement('div');
    uDiv.className = `p-2.5 px-3 rounded-pill bg-dark-glass border pointer text-start text-truncate small ${selectedResultUnit === u ? 'border-info text-info' : 'border-secondary'}`;
    uDiv.innerHTML = `<i class="bi bi-people me-2"></i>${u}`;
    uDiv.onclick = () => selectResultUnit(u);
    container.appendChild(uDiv);
  });
}

function selectResultUnit(unit) {
  selectedResultUnit = unit;
  
  // Highlight active
  document.querySelectorAll('#results-units-list > div').forEach(el => {
    el.classList.remove('border-info', 'text-info');
    el.classList.add('border-secondary');
  });
  
  if (event && event.currentTarget) {
    event.currentTarget.classList.remove('border-secondary');
    event.currentTarget.classList.add('border-info', 'text-info');
  }

  document.getElementById('current-result-unit-title').innerText = unit === 'all' ? 'Tất cả' : unit;
  loadResultsTable();
}

// Chuyển đổi tên đơn vị dài sang dạng viết tắt quân đội B/C/D
function getShortUnit(r) {
  if (r.trungDoi || r.daiDoi || r.tieuDoan) {
    const extractNum = (str) => {
      if (!str) return '';
      const match = str.match(/\d+/);
      return match ? match[0] : str.replace(/(Trung đội|Đại đội|Tiểu đoàn|trung đội|đại đội|tiểu đoàn)\s*/gi, '').trim();
    };
    const b = extractNum(r.trungDoi);
    const c = extractNum(r.daiDoi);
    const d = extractNum(r.tieuDoan);
    
    let parts = [];
    if (b) parts.push('B' + b);
    if (c) parts.push('C' + c);
    if (d) parts.push('D' + d);
    return parts.join('/');
  }
  
  if (r.unit) {
    const bMatch = r.unit.match(/Trung đội\s*(\d+|[A-Za-z0-9_-]+)/i) || r.unit.match(/b\s*(\d+)/i);
    const cMatch = r.unit.match(/Đại đội\s*(\d+|[A-Za-z0-9_-]+)/i) || r.unit.match(/c\s*(\d+)/i);
    const dMatch = r.unit.match(/Tiểu đoàn\s*(\d+|[A-Za-z0-9_-]+)/i) || r.unit.match(/d\s*(\d+)/i);
    
    let parts = [];
    if (bMatch) parts.push('B' + bMatch[1]);
    if (cMatch) parts.push('C' + cMatch[1]);
    if (dMatch) parts.push('D' + dMatch[1]);
    
    if (parts.length > 0) return parts.join('/');
    return r.unit;
  }
  return '-';
}

// Hiển thị bảng điểm
function loadResultsTable() {
  const tbody = document.getElementById('results-table-body');
  tbody.innerHTML = '';

  let filtered = results;

  // Lọc theo Khoa
  if (selectedResultDept !== 'all') {
    filtered = filtered.filter(r => r.departmentId === selectedResultDept);
  }

  // Lọc theo Môn học
  if (selectedResultSubject !== 'all') {
    filtered = filtered.filter(r => r.subjectName === selectedResultSubject);
  }

  // Lọc theo Đơn vị
  if (selectedResultUnit !== 'all') {
    filtered = filtered.filter(r => r.unit === selectedResultUnit);
  }

  // Sắp xếp theo Tên học viên A-Z
  filtered.sort((a, b) => {
    const nameA = a.studentName.split(' ').pop().toLowerCase();
    const nameB = b.studentName.split(' ').pop().toLowerCase();
    return nameA.localeCompare(nameB, 'vi');
  });

  // Phân quyền Xóa (Super Admin và Giáo viên)
  const canDeleteAny = currentUser.role === 'super_admin' || currentUser.role === 'faculty_admin';
  const thDelete = document.getElementById('th-delete-col');
  if (canDeleteAny) {
    thDelete.classList.remove('d-none');
  } else {
    thDelete.classList.add('d-none');
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${canDeleteAny ? 7 : 6}" class="text-center py-5 text-secondary">
          <i class="bi bi-folder-x fs-3 d-block mb-2"></i>
          Không có kết quả thi nào phù hợp.
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(r => {
    const tr = document.createElement('tr');
    
    const hasPermissionToDelete = currentUser.role === 'super_admin' || (currentUser.role === 'faculty_admin' && r.departmentId === currentUser.department);
    let deleteColHtml = '';
    if (canDeleteAny) {
      if (hasPermissionToDelete) {
        deleteColHtml = `
          <td class="text-center">
            <button class="btn btn-sm btn-outline-danger border-0 rounded-circle" onclick="deleteExamResult('${r.id}')" title="Xóa kết quả thi">
              <i class="bi bi-trash-fill"></i>
            </button>
          </td>
        `;
      } else {
        deleteColHtml = `<td class="text-center text-secondary small">-</td>`;
      }
    }

    const shortUnit = getShortUnit(r);

    tr.innerHTML = `
      <td>
        <div class="fw-semibold text-light">${r.studentName}</div>
        <div class="small text-secondary d-md-none mt-0.5">${r.departmentId}</div>
      </td>
      <td>
        <span class="badge badge-outline-purple">${shortUnit}</span>
      </td>
      <td class="small text-secondary-light">${r.subjectName}</td>
      <td class="small text-secondary">${r.examYear}</td>
      <td class="text-center fw-bold text-info fs-6">${r.score}</td>
      <td class="text-center small text-secondary">${r.date}</td>
      ${deleteColHtml}
    `;
    tbody.appendChild(tr);
  });
}

function deleteExamResult(resultId) {
  const r = results.find(item => item.id === resultId);
  if (!r) return;
  
  const hasPermission = currentUser.role === 'super_admin' || (currentUser.role === 'faculty_admin' && r.departmentId === currentUser.department);
  if (!hasPermission) {
    alert("Bạn không có quyền xóa kết quả thi này!");
    return;
  }

  if (confirm('Bạn có chắc chắn muốn xóa bản ghi kết quả thi này khỏi hệ thống?')) {
    results = results.filter(item => item.id !== resultId);
    saveResults();
    loadResultsUnits();
    loadResultsTable();
  }
}

function clearAllResults() {
  if (currentUser.role !== 'super_admin') {
    alert("Chỉ Quản trị viên hệ thống (Super Admin) mới có quyền xóa toàn bộ kết quả thi!");
    return;
  }
  if (confirm("CẢNH BÁO: Bạn có chắc chắn muốn xóa TOÀN BỘ kết quả thi của tất cả các khoa và học viên khỏi hệ thống? Hành động này không thể khôi phục!")) {
    results = [];
    saveResults();
    selectedResultUnit = 'all';
    loadResultsUnits();
    loadResultsTable();
    alert("Đã xóa sạch toàn bộ kết quả thi.");
  }
}

// ============================================================================
// 8. PHÂN HỆ: ADMIN (SUPER ADMIN USER MANAGEMENT)
// ============================================================================
function renderAdmin() {
  toggleNewUserDeptField();
  loadUsersTable();
  
  // Điền khoá API Gemini từ localStorage nếu có
  const savedKey = localStorage.getItem('gemini_api_key') || '';
  const apiKeyInput = document.getElementById('gemini-api-key');
  if (apiKeyInput) {
    apiKeyInput.value = savedKey;
  }

  // Render bảng thông báo đăng nhập
  renderAnnouncementsTable();

  // Tài khoản Cán bộ không có quyền thay đổi thông báo đăng nhập -> Ẩn card thông báo
  const announcementCard = document.getElementById('announcement-table-container') ? document.getElementById('announcement-table-container').closest('.card') : null;
  if (announcementCard) {
    if (currentUser && currentUser.role === 'development') {
      announcementCard.classList.remove('d-none');
    } else {
      announcementCard.classList.add('d-none');
    }
  }
}

function renderAnnouncementsTable() {
  const container = document.getElementById('announcement-table-container');
  if (!container) return;
  
  let saved = [];
  try {
    const raw = localStorage.getItem('study_announcements');
    saved = raw ? JSON.parse(raw) : [];
  } catch (e) {
    saved = [];
  }
  
  if (saved.length === 0) {
    const fallback = localStorage.getItem('study_announcement') || '';
    saved = fallback ? fallback.split('\n').map(l => l.trim()).filter(Boolean) : [];
    if (saved.length === 0) {
      saved = ['Vì mục đích bảo mật, vui lòng sử dụng tài khoản và mật khẩu của đơn vị thuộc quyền cấp phát.'];
    }
  }
  
  let html = `
    <table class="table table-dark table-bordered align-middle m-0" style="font-size: 0.85rem;">
      <thead>
        <tr class="text-secondary small">
          <th style="width: 50px;" class="text-center">TT</th>
          <th>Nội dung thông báo</th>
          <th style="width: 60px;" class="text-center">Xóa</th>
        </tr>
      </thead>
      <tbody id="announcement-rows-body">
  `;
  
  saved.forEach((text, idx) => {
    html += `
      <tr>
        <td class="text-center fw-bold text-secondary">${idx + 1}</td>
        <td>
          <input type="text" class="form-control form-control-sm bg-dark-glass text-light border-secondary announcement-row-input" value="${text.replace(/"/g, '&quot;')}" placeholder="Nhập thông báo...">
        </td>
        <td class="text-center">
          <button type="button" class="btn btn-sm btn-outline-danger border-0 p-1 rounded-circle" onclick="deleteAnnouncementRow(this)" title="Xóa dòng">
            <i class="bi bi-trash-fill"></i>
          </button>
        </td>
      </tr>
    `;
  });
  
  html += `
      </tbody>
    </table>
  `;
  container.innerHTML = html;
}

function addAnnouncementRow() {
  const tbody = document.getElementById('announcement-rows-body');
  if (!tbody) return;
  const rowCount = tbody.children.length;
  
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="text-center fw-bold text-secondary">${rowCount + 1}</td>
    <td>
      <input type="text" class="form-control form-control-sm bg-dark-glass text-light border-secondary announcement-row-input" value="" placeholder="Nhập thông báo mới...">
    </td>
    <td class="text-center">
      <button type="button" class="btn btn-sm btn-outline-danger border-0 p-1 rounded-circle" onclick="deleteAnnouncementRow(this)" title="Xóa dòng">
        <i class="bi bi-trash-fill"></i>
      </button>
    </td>
  `;
  tbody.appendChild(tr);
}

function deleteAnnouncementRow(btn) {
  const tr = btn.closest('tr');
  if (tr) {
    tr.remove();
    // Re-index row numbers
    const tbody = document.getElementById('announcement-rows-body');
    if (tbody) {
      Array.from(tbody.children).forEach((child, idx) => {
        child.firstElementChild.innerText = idx + 1;
      });
    }
  }
}

function saveAllAnnouncements() {
  if (!currentUser || currentUser.role !== 'development') {
    alert("Chỉ tài khoản Developer mới có quyền thay đổi thông báo đăng nhập!");
    return;
  }
  
  const inputs = document.querySelectorAll('.announcement-row-input');
  const texts = Array.from(inputs).map(inp => inp.value.trim()).filter(Boolean);
  
  if (texts.length === 0) {
    alert("Vui lòng nhập ít nhất 1 thông báo!");
    return;
  }
  
  localStorage.setItem('study_announcements', JSON.stringify(texts));
  localStorage.setItem('study_announcement', texts.join('\n'));
  
  alert("Cập nhật toàn bộ thông báo đăng nhập thành công!");
  saveDataToServer();
  updateLoginAnnouncement();
}

function updateLoginAnnouncement() {
  const marquee = document.getElementById('login-announcement-marquee');
  if (marquee) {
    let saved = [];
    try {
      const raw = localStorage.getItem('study_announcements');
      saved = raw ? JSON.parse(raw) : [];
    } catch (e) {
      saved = [];
    }
    if (saved.length === 0) {
      const fallback = localStorage.getItem('study_announcement') || '';
      saved = fallback ? fallback.split('\n').map(l => l.trim()).filter(Boolean) : [];
      if (saved.length === 0) {
        saved = ['Vì mục đích bảo mật, vui lòng sử dụng tài khoản và mật khẩu của đơn vị thuộc quyền cấp phát.'];
      }
    }
    // Nối đuôi nhau các thông báo bằng dấu chấm tròn
    const chosen = saved.join('   •   ');
    marquee.innerText = chosen;
  }
}

function openChangePasswordModal() {
  const modalEl = document.getElementById('changePasswordModal');
  if (modalEl) {
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  }
}

function handleChangePassword(event) {
  event.preventDefault();
  const newPw = document.getElementById('cp-new-password').value;
  const confirmPw = document.getElementById('cp-confirm-password').value;
  
  if (newPw.length < 6) {
    alert('Mật khẩu mới phải có tối thiểu 6 ký tự!');
    return;
  }
  
  if (newPw !== confirmPw) {
    alert('Xác nhận mật khẩu mới không khớp!');
    return;
  }
  
  if (!currentUser) {
    alert('Vui lòng đăng nhập để đổi mật khẩu!');
    return;
  }
  
  const userIdx = accounts.findIndex(acc => acc.username === currentUser.username);
  if (userIdx !== -1) {
    accounts[userIdx].password = newPw;
    currentUser.password = newPw;
    localStorage.setItem('study_current_user', JSON.stringify(currentUser));
    
    // Đồng bộ dữ liệu
    saveDataToServer();
    
    alert('Đổi mật khẩu thành công!');
    
    // Đóng modal
    const modalEl = document.getElementById('changePasswordModal');
    if (modalEl) {
      let modal = bootstrap.Modal.getInstance(modalEl);
      if (!modal) {
        modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      }
      modal.hide();
    }
    
    // Reset form
    document.getElementById('change-password-form').reset();
  } else {
    alert('Không tìm thấy tài khoản tương ứng trên hệ thống!');
  }
}

function toggleNewUserDeptField() {
  const role = document.getElementById('new-role').value;
  const deptContainer = document.getElementById('new-user-dept-container');
  const militaryContainer = document.getElementById('new-user-military-container');
  
  if (role === 'faculty_admin') {
    deptContainer.classList.remove('d-none');
    document.getElementById('new-department').setAttribute('required', 'true');
    if (militaryContainer) militaryContainer.classList.add('d-none');
  } else {
    deptContainer.classList.add('d-none');
    document.getElementById('new-department').removeAttribute('required');
    if (militaryContainer) {
      if (role === 'student' || role === 'super_admin') {
        militaryContainer.classList.remove('d-none');
      } else {
        militaryContainer.classList.add('d-none');
      }
    }
  }
}

function loadUsersTable() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const isDevUser = currentUser && currentUser.role === 'development';
  const headerRow = document.getElementById('users-table-header-row');
  if (headerRow) {
    headerRow.innerHTML = `
      <th>Tên đăng nhập</th>
      <th>Họ và Tên</th>
      ${isDevUser ? '<th>Mật khẩu</th>' : ''}
      <th>Vai trò</th>
      <th>Đơn vị trực thuộc</th>
      <th class="text-center">Thao tác</th>
    `;
  }

  const filterVal = document.getElementById('filter-user-role') ? document.getElementById('filter-user-role').value : 'all';

  let filteredAccounts = accounts;
  if (filterVal !== 'all') {
    filteredAccounts = accounts.filter(acc => acc.role === filterVal);
  }

  filteredAccounts.forEach(acc => {
    const tr = document.createElement('tr');
    
    let roleBadge = '<span class="badge bg-secondary-glass text-secondary-light">Học viên</span>';
    if (acc.role === 'super_admin') {
      roleBadge = '<span class="badge bg-danger bg-opacity-25 text-warning">Cán bộ</span>';
    } else if (acc.role === 'faculty_admin') {
      roleBadge = '<span class="badge bg-primary-glass text-info">Giáo viên</span>';
    } else if (acc.role === 'development') {
      roleBadge = '<span class="badge bg-info bg-opacity-25 text-info">Developer</span>';
    }

    const isSystemAdmin = acc.username === 'admin'; // Không cho xóa admin gốc
    const isDeveloper = acc.role === 'development';
    // Tài khoản Cán bộ không được xóa tài khoản Developer
    const canDelete = !isSystemAdmin && !(currentUser && currentUser.role === 'super_admin' && isDeveloper);

    let deptOrUnit = acc.department === 'all' ? 'Tất cả khoa' : (acc.department === 'none' ? '-' : acc.department);
    if ((acc.role === 'student' || acc.role === 'super_admin') && (acc.trungDoi || acc.daiDoi || acc.tieuDoan)) {
      const parts = [];
      if (acc.trungDoi) parts.push(acc.trungDoi);
      if (acc.daiDoi) parts.push(acc.daiDoi);
      if (acc.tieuDoan) parts.push(acc.tieuDoan);
      deptOrUnit = parts.join(' - ');
    }

    tr.innerHTML = `
      <td><code class="text-warning-light">${acc.username}</code></td>
      <td>${acc.name}</td>
      ${isDevUser ? `<td><code class="text-info">${acc.password}</code></td>` : ''}
      <td>${roleBadge}</td>
      <td><span class="badge bg-dark-glass border-secondary">${deptOrUnit}</span></td>
      <td class="text-center">
        ${!canDelete ? '<span class="text-secondary small">Mặc định</span>' : `
          <button class="btn btn-sm btn-outline-danger border-0 rounded-circle" onclick="deleteUser('${acc.username}')" title="Xóa tài khoản">
            <i class="bi bi-trash-fill"></i>
          </button>
        `}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function handleCreateUser(event) {
  event.preventDefault();
  const username = document.getElementById('new-username').value.trim();
  const password = document.getElementById('new-password').value;
  const name = document.getElementById('new-name').value.trim();
  const role = document.getElementById('new-role').value;
  const dept = role === 'faculty_admin' ? document.getElementById('new-department').value : 'none';

  if (password.length < 6) {
    alert('Mật khẩu đăng ký phải từ 6 ký tự trở lên!');
    return;
  }

  // Kiểm tra trùng username
  if (accounts.some(acc => acc.username === username)) {
    alert('Tên đăng nhập này đã tồn tại! Vui lòng chọn tên đăng nhập khác.');
    return;
  }

  let tdVal = document.getElementById('new-trung-doi').value.trim();
  let ddVal = document.getElementById('new-dai-doi').value.trim();
  let tieuDVal = document.getElementById('new-tieu-doan').value.trim();

  if (role === 'student') {
    if (!tdVal || !ddVal || !tieuDVal) {
      alert("Học viên bắt buộc phải điền đầy đủ Trung đội, Đại đội và Tiểu đoàn!");
      return;
    }
  }

  // Chuyển đổi số thuần túy thành văn bản đơn vị tương ứng
  if (tdVal && /^\d+$/.test(tdVal)) tdVal = 'Trung đội ' + tdVal;
  if (ddVal && /^\d+$/.test(ddVal)) ddVal = 'Đại đội ' + ddVal;
  if (tieuDVal && /^\d+$/.test(tieuDVal)) tieuDVal = 'Tiểu đoàn ' + tieuDVal;

  const newUser = {
    username: username,
    password: password,
    role: role,
    department: dept,
    name: name
  };

  if (role === 'student' || role === 'super_admin') {
    newUser.trungDoi = tdVal;
    newUser.daiDoi = ddVal;
    newUser.tieuDoan = tieuDVal;
  }

  accounts.push(newUser);
  saveAccounts();
  
  document.getElementById('create-user-form').reset();
  toggleNewUserDeptField();
  loadUsersTable();
  alert('Đã cấp phát tài khoản thành công!');
}

function deleteUser(username) {
  const targetUser = accounts.find(acc => acc.username === username);
  if (targetUser && targetUser.role === 'development' && currentUser && currentUser.role === 'super_admin') {
    alert("Cán bộ không có quyền xóa tài khoản Developer!");
    return;
  }
  
  if (confirm(`Bạn có chắc chắn muốn xóa tài khoản "${username}"?`)) {
    accounts = accounts.filter(acc => acc.username !== username);
    saveAccounts();
    loadUsersTable();
  }
}

function importAccountsFromExcel() {
  const fileInput = document.getElementById('excel-file-input');
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    alert("Vui lòng chọn một tệp Excel (.xlsx, .xls) hoặc CSV trước!");
    return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();

  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length <= 1) {
        alert("Tệp Excel rỗng hoặc chỉ có dòng tiêu đề!");
        return;
      }

      const headers = jsonData[0].map(h => String(h || '').trim().toLowerCase());
      
      const usernameIdx = headers.findIndex(h => h.includes("tên đăng nhập") || h.includes("username") || h.includes("login"));
      const passwordIdx = headers.findIndex(h => h.includes("mật khẩu") || h.includes("password") || h.includes("pass"));
      const nameIdx = headers.findIndex(h => h.includes("họ và tên") || h.includes("fullname") || h.includes("tên hiển thị") || h.includes("name"));
      const roleIdx = headers.findIndex(h => h.includes("vai trò") || h.includes("role"));
      const tdIdx = headers.findIndex(h => h.includes("trung đội") || h.includes("trung doi"));
      const ddIdx = headers.findIndex(h => h.includes("đại đội") || h.includes("dai doi"));
      const tdoanIdx = headers.findIndex(h => h.includes("tiểu đoàn") || h.includes("tieu doan"));

      if (usernameIdx === -1 || passwordIdx === -1 || roleIdx === -1) {
        alert("Định dạng cột không đúng! Tệp Excel tối thiểu phải có các cột: 'Tên đăng nhập', 'Mật khẩu', 'Vai trò'");
        return;
      }

      let importedCount = 0;
      let skippedCount = 0;

      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;

        const username = String(row[usernameIdx] || '').trim();
        const password = String(row[passwordIdx] || '').trim();
        const name = String(row[nameIdx] || username).trim();
        let rawRole = String(row[roleIdx] || 'student').trim().toLowerCase();

        if (!username || !password) {
          skippedCount++;
          continue;
        }

        let role = 'student';
        if (rawRole.includes('cán bộ') || rawRole.includes('admin') || rawRole.includes('super')) {
          role = 'super_admin';
        } else if (rawRole.includes('dev') || rawRole.includes('development')) {
          role = 'development';
        }

        if (accounts.some(acc => acc.username === username)) {
          skippedCount++;
          continue;
        }

        let tdVal = tdIdx !== -1 ? String(row[tdIdx] || '').trim() : '';
        let ddVal = ddIdx !== -1 ? String(row[ddIdx] || '').trim() : '';
        let tieuDVal = tdoanIdx !== -1 ? String(row[tdoanIdx] || '').trim() : '';

        if (role === 'student') {
          if (!tdVal || !ddVal || !tieuDVal) {
            skippedCount++;
            continue;
          }
        }

        // Chuyển đổi số thuần túy thành văn bản đơn vị tương ứng
        if (tdVal && /^\d+$/.test(tdVal)) tdVal = 'Trung đội ' + tdVal;
        if (ddVal && /^\d+$/.test(ddVal)) ddVal = 'Đại đội ' + ddVal;
        if (tieuDVal && /^\d+$/.test(tieuDVal)) tieuDVal = 'Tiểu đoàn ' + tieuDVal;

        const newUser = {
          username: username,
          password: password,
          role: role,
          name: name,
          department: 'none'
        };

        if (role === 'student' || role === 'super_admin') {
          newUser.trungDoi = tdVal;
          newUser.daiDoi = ddVal;
          newUser.tieuDoan = tieuDVal;
        }

        accounts.push(newUser);
        importedCount++;
      }

      if (importedCount > 0) {
        saveAccounts();
        loadUsersTable();
        alert(`Đã nhập thành công ${importedCount} tài khoản từ Excel! (Bỏ qua ${skippedCount} tài khoản trùng hoặc thiếu thông tin)`);
      } else {
        alert(`Không nhập được tài khoản nào. Có thể các tài khoản đều đã tồn tại hoặc tệp bị thiếu dữ liệu.`);
      }
      fileInput.value = '';
    } catch (err) {
      console.error(err);
      alert("Lỗi khi đọc tệp Excel: " + err.message);
    }
  };

  reader.readAsArrayBuffer(file);
}

// ============================================================================
// 8.1 TIỆN ÍCH CẤU HÌNH VÀ THI VẤN ĐÁP AI
// ============================================================================

// 1. Lưu Gemini API Key
function saveGeminiKey() {
  const key = document.getElementById('gemini-api-key').value.trim();
  localStorage.setItem('gemini_api_key', key);
  alert('Đã lưu cấu hình Gemini API Key thành công!');
}

// 1.2 Khôi phục dữ liệu mẫu hệ thống
function forceResetSystemData() {
  if (confirm("CẢNH BÁO: Thao tác này sẽ xóa sạch dữ liệu cục bộ trong trình duyệt của bạn và nạp lại toàn bộ môn học, đề thi mẫu mới nhất từ file hệ thống. Bạn có chắc chắn muốn tiếp tục?")) {
    localStorage.clear();
    alert("Đã xóa sạch bộ nhớ đệm! Ứng dụng sẽ tự động tải lại trang để nạp dữ liệu mới.");
    window.location.reload();
  }
}

// 2. Nhận diện giọng nói Web Speech API
let speechRecognitionObj = null;
let isSpeechRecording = false;

function toggleSpeechRecognition(qIdx, buttonId, textareaId) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    alert("Trình duyệt của bạn không hỗ trợ công nghệ nhận diện giọng nói (Web Speech API). Vui lòng sử dụng Google Chrome, Microsoft Edge hoặc Safari và kết nối microphone.");
    return;
  }

  const micBtn = document.getElementById(buttonId);
  const statusSpan = document.getElementById(buttonId === 'p-mic-btn' ? 'p-mic-status' : `sys-mic-status-${qIdx}`);
  const wavesDiv = document.getElementById(buttonId === 'p-mic-btn' ? 'p-waves' : `waves-${qIdx}`);
  const textarea = document.getElementById(textareaId);

  if (isSpeechRecording) {
    // Dừng ghi âm
    if (speechRecognitionObj) {
      speechRecognitionObj.stop();
    }
    return;
  }

  // Khởi tạo và chạy ghi âm
  isSpeechRecording = true;
  speechRecognitionObj = new SpeechRecognition();
  speechRecognitionObj.lang = 'vi-VN';
  speechRecognitionObj.continuous = true;
  speechRecognitionObj.interimResults = true;

  micBtn.classList.add('recording');
  if (statusSpan) statusSpan.innerText = "Đang lắng nghe... Nói đi...";
  if (wavesDiv) wavesDiv.classList.add('active');

  let finalTranscript = textarea.value;

  speechRecognitionObj.onresult = (event) => {
    let interimTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += (finalTranscript ? ' ' : '') + event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }
    textarea.value = finalTranscript + (interimTranscript ? ' [' + interimTranscript + ']' : '');
    // Tự động cuộn xuống cuối textarea
    textarea.scrollTop = textarea.scrollHeight;
    
    // Lưu câu trả lời vào bộ lưu trữ đệm
    if (buttonId.startsWith('sys-mic-btn-')) {
      saveSystemPracticeEssay(qIdx, textarea.value);
    }
  };

  speechRecognitionObj.onerror = (event) => {
    console.error("Lỗi Speech Recognition:", event.error);
    if (event.error === 'not-allowed') {
      alert("Lỗi: Trình duyệt chưa được cấp quyền sử dụng Microphone!\n\nCách khắc phục:\n1. Click vào biểu tượng ổ khóa (hoặc biểu tượng micro) nằm ở góc trái thanh địa chỉ trình duyệt (bên cạnh 'localhost:5000').\n2. Chuyển trạng thái Microphone sang 'Cho phép' (Allow).\n3. Tải lại trang (F5) và thử nói lại.");
    } else if (event.error === 'no-speech') {
      if (statusSpan) statusSpan.innerText = "Không phát hiện giọng nói. Hãy nói to rõ ràng hơn!";
    } else {
      alert("Lỗi Microphone: " + event.error + "\nVui lòng kiểm tra lại thiết bị ghi âm của bạn.");
    }
    stopRecordingUI(micBtn, statusSpan, wavesDiv);
  };

  speechRecognitionObj.onend = () => {
    // Xóa ký tự nháp [đang nói] nếu có
    textarea.value = textarea.value.replace(/\s*\[[^\]]*\]$/, '');
    stopRecordingUI(micBtn, statusSpan, wavesDiv);
  };

  speechRecognitionObj.start();
}

function stopRecordingUI(micBtn, statusSpan, wavesDiv) {
  isSpeechRecording = false;
  if (micBtn) micBtn.classList.remove('recording');
  if (statusSpan) statusSpan.innerText = "Nhấp để tiếp tục nói";
  if (wavesDiv) wavesDiv.classList.remove('active');
}

// 3. Gọi AI Gemini chấm điểm dựa trên Barem
async function evaluateAnswerWithAI(question, sampleAnswer, barem, studentAnswer, keywords) {
  const apiKey = localStorage.getItem('gemini_api_key') || '';
  
  if (!apiKey) {
    // Không có API Key -> Chạy chế độ giả lập offline để thử nghiệm
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(evaluateOffline(question, sampleAnswer, barem, studentAnswer, keywords));
      }, 1500); // Tạo độ trễ giả lập giống gọi API
    });
  }

  // Chuẩn bị prompt chi tiết
  const systemPrompt = `Bạn là một giảng viên chấm thi vấn đáp chuyên nghiệp. Hãy chấm điểm câu trả lời của học viên dựa trên câu hỏi, đáp án mẫu và Barem điểm dưới đây.
  
- Câu hỏi: ${question}
- Đáp án mẫu: ${sampleAnswer}
- BAREM ĐIỂM (TIÊU CHÍ CHẤM):
${barem || "Hãy chấm dựa trên độ chính xác kiến thức và tính trôi chảy của câu trả lời."}
- Câu trả lời của học viên: ${studentAnswer || "(Học viên không trả lời)"}

Yêu cầu chấm điểm thật khách quan theo đúng BAREM ĐIỂM do giáo viên thiết lập. Thang điểm tối đa là 10.0.
Trả về một chuỗi JSON thô duy nhất, không kèm định dạng markdown (\`\`\`json ... \`\`\`), có các trường sau:
{
  "score": [Điểm số chấm theo thang điểm 10, ví dụ 8.5],
  "barem_breakdown": [Giải thích chi tiết xem học viên đạt hay không đạt tiêu chí nào trong barem để ra điểm số trên],
  "fluency": [Đánh giá ngắn gọn về sự trôi chảy, cách diễn đạt, phát âm từ vựng],
  "accuracy": [Đánh giá ngắn gọn về độ chính xác và đầy đủ kiến thức so với đáp án mẫu],
  "feedback": [Nhận xét chung và lời khuyên mang tính xây dựng giúp học viên cải thiện thêm]
}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: systemPrompt }]
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    let textResult = data.candidates[0].content.parts[0].text.trim();
    
    // Xử lý làm sạch chuỗi JSON phòng trường hợp Gemini bọc markdown ```json ... ```
    textResult = textResult.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    
    const parsedJSON = JSON.parse(textResult);
    return {
      score: parsedJSON.score !== undefined ? parsedJSON.score : 0,
      barem_breakdown: parsedJSON.barem_breakdown || "Không có giải trình cụ thể.",
      fluency: parsedJSON.fluency || "Đánh giá trôi chảy chưa hoàn thiện.",
      accuracy: parsedJSON.accuracy || "Đánh giá chính xác chưa hoàn thiện.",
      feedback: parsedJSON.feedback || "Không có lời khuyên."
    };
  } catch (err) {
    console.error("Lỗi khi kết nối với Gemini API:", err);
    // Nếu API lỗi, fallback sang bộ chấm điểm offline
    return evaluateOffline(question, sampleAnswer, barem, studentAnswer, keywords);
  }
}

// 4. Bộ chấm điểm giả lập Offline (So khớp từ khóa & barem)
function evaluateOffline(question, sampleAnswer, barem, studentAnswer, keywords) {
  const ansLower = studentAnswer.toLowerCase();
  
  // So khớp từ khóa chuyên ngành
  let matchedKeywords = [];
  if (keywords && keywords.length > 0) {
    matchedKeywords = keywords.filter(kw => ansLower.includes(kw.toLowerCase()));
  }

  // Đếm từ để kiểm tra độ trôi chảy
  const wordCount = studentAnswer.trim().split(/\s+/).filter(Boolean).length;
  
  // Thuật toán tính điểm giả lập
  let score = 0;
  let breakdown = "";
  let fluency = "";
  let accuracy = "";
  let feedback = "";

  if (wordCount < 5) {
    score = 0;
    breakdown = "- Câu trả lời quá ngắn hoặc bỏ trống: 0 điểm.\n- Không đáp ứng bất kỳ tiêu chí nào của Barem.";
    fluency = "Chưa diễn đạt (Quá ngắn).";
    accuracy = "Không có thông tin kiến thức.";
    feedback = "Bạn cần tích cực trả lời hoặc nói to rõ ràng vào microphone để hệ thống ghi nhận.";
  } else {
    // 1. Phân tích Barem giả lập
    let baremLines = barem ? barem.split('\n').map(l => l.trim()).filter(Boolean) : [];
    let baremPoints = [];
    
    if (baremLines.length > 0) {
      let allocatedScore = 0;
      baremLines.forEach((line, index) => {
        // Tìm điểm số được phân bổ trong dòng barem (ví dụ: "3 điểm" hoặc "3đ")
        const pointMatch = line.match(/(\d+)\s*(điểm|đ)/i);
        const pts = pointMatch ? parseInt(pointMatch[1]) : 2; // mặc định 2 điểm mỗi ý nếu không ghi rõ
        
        // Giả lập kiểm tra đạt hay không đạt dựa trên độ dài và số từ khóa khớp
        let isSuccess = false;
        if (index === 0 && wordCount >= 10) isSuccess = true;
        if (index === 1 && matchedKeywords.length >= 1) isSuccess = true;
        if (index === 2 && matchedKeywords.length >= 2) isSuccess = true;
        if (index >= 3 && wordCount >= 25) isSuccess = true;

        if (isSuccess) {
          score += pts;
          baremPoints.push(`✓ [Đạt] ${line} (+${pts}đ)`);
        } else {
          baremPoints.push(`✗ [Chưa đạt] ${line} (Cần bổ sung ý này)`);
        }
      });
      
      // Giới hạn điểm tối đa 10
      score = Math.min(10, score);
      breakdown = baremPoints.join('\n');
    } else {
      // Nếu giáo viên không thiết lập barem, tự động tính theo từ khóa và độ dài
      const kwRatio = keywords.length > 0 ? matchedKeywords.length / keywords.length : 1;
      const lengthScore = Math.min(4, (wordCount / 40) * 4); // max 4 điểm cho độ dài câu
      const kwScore = kwRatio * 6; // max 6 điểm cho từ khóa
      
      score = parseFloat((kwScore + lengthScore).toFixed(1));
      score = Math.min(10, score);
      
      breakdown = `- So khớp từ khóa chuyên ngành đạt: ${matchedKeywords.length}/${keywords.length} từ khóa (+${kwScore.toFixed(1)}đ)\n- Độ dài câu trả lời đạt ${wordCount} từ (+${lengthScore.toFixed(1)}đ)`;
    }

    // 2. Đánh giá Trôi chảy
    if (wordCount >= 40) {
      fluency = "Diễn đạt rất trôi chảy, bài giải có chiều sâu, kết cấu tốt.";
    } else if (wordCount >= 20) {
      fluency = "Trình bày mạch lạc, tốc độ nói vừa phải, dễ hiểu.";
    } else {
      fluency = "Nội dung nói hơi ngắn, cần trình bày lưu loát và mở rộng câu trả lời hơn.";
    }

    // 3. Đánh giá Chính xác
    const kwPercent = keywords.length > 0 ? (matchedKeywords.length / keywords.length) * 100 : 100;
    if (kwPercent >= 75) {
      accuracy = "Kiến thức chuẩn xác, đầy đủ các thuật ngữ chuyên ngành.";
    } else if (kwPercent >= 40) {
      accuracy = "Nêu được các ý cốt lõi nhưng thiếu một số từ khóa chuyên môn quan trọng.";
    } else {
      accuracy = "Kiến thức còn chung chung, chưa đi vào trọng tâm câu hỏi.";
    }

    // 4. Nhận xét Lời khuyên
    if (score >= 8) {
      feedback = "Rất tốt! Bạn đã nắm vững kiến thức nền tảng và diễn đạt mạch lạc. Hãy phát huy cách trả lời này trong phòng thi vấn đáp.";
    } else if (score >= 5) {
      feedback = `Cần lưu ý bổ sung các ý chưa đạt trong Barem điểm. Hãy tập nói to rõ ràng hơn và chèn thêm các từ khóa chuyên ngành như: ${keywords.slice(0, 3).join(', ')}.`;
    } else {
      feedback = "Bạn cần ôn tập lại kiến thức lý thuyết trong đáp án mẫu và luyện tập cách trả lời tự tin, đầy đủ câu chữ hơn.";
    }
  }

  return {
    score: score,
    barem_breakdown: breakdown,
    fluency: fluency,
    accuracy: accuracy,
    feedback: feedback
  };
}

// 5. Chạy kiểm tra vấn đáp ở phần Luyện tập Cá nhân
async function checkPersonalPracticeInterview() {
  const q = personalQuestions[currentPersonalQIndex];
  const ansText = document.getElementById('p-interview-ans').value.trim();

  if (!ansText) {
    alert("Vui lòng trả lời câu hỏi bằng cách nói qua Microphone hoặc nhập bàn phím trước khi chấm!");
    return;
  }

  // Tắt ghi âm nếu đang chạy
  if (isSpeechRecording && speechRecognitionObj) {
    speechRecognitionObj.stop();
  }

  // Hiện màn hình chờ chấm điểm AI
  const gradeBtn = document.getElementById('p-ai-grade-btn');
  gradeBtn.setAttribute('disabled', 'true');
  gradeBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span> AI đang chấm bài...`;

  const resultCard = document.getElementById('p-ai-result-card');
  resultCard.classList.remove('d-none');
  
  // Đặt trạng thái loading
  document.getElementById('p-ai-score-val').innerText = "...";
  document.getElementById('p-ai-barem-breakdown').innerText = "Đang phân tích...";
  document.getElementById('p-ai-fluency').innerText = "Đang phân tích...";
  document.getElementById('p-ai-accuracy').innerText = "Đang phân tích...";
  document.getElementById('p-ai-feedback').innerText = "Đang phân tích...";

  // Gọi chấm điểm
  const aiRes = await evaluateAnswerWithAI(q.question, q.sampleAnswer || '', q.barem || '', ansText, q.keywords || []);

  // Hiển thị kết quả chấm điểm AI lên giao diện
  gradeBtn.removeAttribute('disabled');
  gradeBtn.innerHTML = `<i class="bi bi-robot me-1"></i>AI Chấm Điểm`;

  // Thay đổi màu sắc vòng tròn điểm theo mức độ
  const circle = document.getElementById('p-ai-score-circle');
  circle.className = "ai-score-circle";
  const numScore = parseFloat(aiRes.score);
  if (numScore >= 8.0) {
    circle.classList.add('score-high');
  } else if (numScore >= 5.0) {
    circle.classList.add('score-medium');
  } else {
    circle.classList.add('score-low');
  }

  document.getElementById('p-ai-score-val').innerText = aiRes.score;
  document.getElementById('p-ai-barem-breakdown').innerText = aiRes.barem_breakdown;
  document.getElementById('p-ai-fluency').innerText = aiRes.fluency;
  document.getElementById('p-ai-accuracy').innerText = aiRes.accuracy;
  document.getElementById('p-ai-feedback').innerText = aiRes.feedback;
}

// 6. Chạy kiểm tra vấn đáp ở phần Luyện tập Hệ thống
async function checkSystemPracticeInterview(qIdx) {
  const q = systemState.questions[qIdx];
  const ansText = document.getElementById(`system-ans-${qIdx}`).value.trim();

  if (!ansText) {
    alert("Vui lòng trả lời câu hỏi vấn đáp bằng giọng nói hoặc gõ chữ trước khi AI chấm điểm!");
    return;
  }

  // Tắt ghi âm nếu đang chạy
  if (isSpeechRecording && speechRecognitionObj) {
    speechRecognitionObj.stop();
  }

  // Hiện màn hình chờ chấm điểm AI
  const gradeBtn = document.getElementById(`sys-ai-grade-btn-${qIdx}`);
  gradeBtn.setAttribute('disabled', 'true');
  gradeBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span> AI đang chấm bài...`;

  const resultCard = document.getElementById(`sys-ai-result-card-${qIdx}`);
  resultCard.classList.remove('d-none');
  
  // Đặt trạng thái loading
  document.getElementById(`sys-ai-score-val-${qIdx}`).innerText = "...";
  document.getElementById(`sys-ai-barem-breakdown-${qIdx}`).innerText = "Đang phân tích...";
  document.getElementById(`sys-ai-fluency-${qIdx}`).innerText = "Đang phân tích...";
  document.getElementById(`sys-ai-accuracy-${qIdx}`).innerText = "Đang phân tích...";
  document.getElementById(`sys-ai-feedback-${qIdx}`).innerText = "Đang phân tích...";

  // Gọi chấm điểm
  const aiRes = await evaluateAnswerWithAI(q.question, q.sampleAnswer || '', q.barem || '', ansText, q.keywords || []);

  // Lưu trạng thái hoàn tất câu hỏi để không cho ghi âm đè tiếp
  systemState.checkedAnswers[qIdx] = true;
  systemState.answers[qIdx] = ansText;

  // Cập nhật kết quả chấm điểm AI lên giao diện
  gradeBtn.removeAttribute('disabled');
  gradeBtn.innerHTML = `<i class="bi bi-robot me-1"></i>AI Chấm Điểm`;

  // Thay đổi màu sắc vòng tròn điểm theo mức độ
  const circle = document.getElementById(`sys-ai-score-circle-${qIdx}`);
  circle.className = "ai-score-circle";
  const numScore = parseFloat(aiRes.score);
  if (numScore >= 8.0) {
    circle.classList.add('score-high');
  } else if (numScore >= 5.0) {
    circle.classList.add('score-medium');
  } else {
    circle.classList.add('score-low');
  }

  document.getElementById(`sys-ai-score-val-${qIdx}`).innerText = aiRes.score;
  document.getElementById(`sys-ai-barem-breakdown-${qIdx}`).innerText = aiRes.barem_breakdown;
  document.getElementById(`sys-ai-fluency-${qIdx}`).innerText = aiRes.fluency;
  document.getElementById(`sys-ai-accuracy-${qIdx}`).innerText = aiRes.accuracy;
  document.getElementById(`sys-ai-feedback-${qIdx}`).innerText = aiRes.feedback;

  // Ẩn Microphone
  document.querySelector(`#system-exam-runner .mic-btn-container`).classList.add('d-none');
}

// ============================================================================
// 9. KHỞI CHẠY HỆ THỐNG
// ============================================================================
function renderDashboard() {
  // Toggle hiển thị nút Admin Panel trên Navbar
  const adminNav = document.getElementById('nav-admin-item');
  if (adminNav) {
    if (currentUser && (currentUser.role === 'super_admin' || currentUser.role === 'development')) {
      adminNav.classList.remove('d-none');
    } else {
      adminNav.classList.add('d-none');
    }
  }
}


// ============================================================================
// 10. PHẦN HỒ SƠ VÀ CÁC CHỨC NĂNG BỔ SUNG (MODAL, IMPORTS, COMMENTS, HỌA HÌNH)
// ============================================================================

// --- 10.1 Quản lý Modal & Hướng dẫn Excel Tài khoản ---
function downloadExcelTemplate(event) {
  if (event) event.preventDefault();
  const modal = new bootstrap.Modal(document.getElementById('accountsExcelInstructionModal'));
  modal.show();
}

function triggerActualTemplateDownload() {
  const ws_data = [
    ["Tên đăng nhập", "Mật khẩu", "Họ và Tên", "Vai trò", "Trung đội", "Đại đội", "Tiểu đoàn"],
    ["nguyenvanan", "nguyenvanan", "Nguyễn Văn An", "student", "Trung đội 1", "Đại đội 1", "Tiểu đoàn 1"],
    ["hoangvanthai", "hoangvanthai", "Hoàng Văn Thái", "super_admin", "", "", ""],
    ["developer", "170724dcsvn", "Nhà phát triển", "development", "", "", ""]
  ];
  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Danh sach tai khoan");
  XLSX.writeFile(wb, "mau_danh_sach_tai_khoan.xlsx");
}

function openPersonalImportModal() {
  const modal = new bootstrap.Modal(document.getElementById('personalImportInstructionModal'));
  
  // Reset tab to Word by default
  const wordTabEl = document.getElementById('import-word-tab');
  const triggerTab = new bootstrap.Tab(wordTabEl);
  triggerTab.show();
  
  const wordTab = document.getElementById('import-word-tab');
  const excelTab = document.getElementById('import-excel-tab');
  const wordBtn = document.getElementById('btn-import-word-trigger');
  const excelBtn = document.getElementById('btn-import-excel-trigger');
  
  wordTab.onclick = () => {
    wordBtn.classList.remove('d-none');
    excelBtn.classList.add('d-none');
  };
  excelTab.onclick = () => {
    wordBtn.classList.add('d-none');
    excelBtn.classList.remove('d-none');
  };
  
  wordBtn.classList.remove('d-none');
  excelBtn.classList.add('d-none');
  
  modal.show();
}

function triggerPersonalWordFileSelect() {
  const modalEl = document.getElementById('personalImportInstructionModal');
  const modalInstance = bootstrap.Modal.getInstance(modalEl);
  if (modalInstance) modalInstance.hide();
  document.getElementById('personal-word-import').click();
}

function triggerPersonalExcelFileSelect() {
  const modalEl = document.getElementById('personalImportInstructionModal');
  const modalInstance = bootstrap.Modal.getInstance(modalEl);
  if (modalInstance) modalInstance.hide();
  document.getElementById('personal-excel-import').click();
}

// --- 10.2 Nhập câu hỏi cá nhân từ Word/Excel ---
function importPersonalWord(event) {
  const file = event.target.files[0];
  if (!file) return;

  const deptSelect = document.getElementById('pq-select-dept');
  const subjectSelect = document.getElementById('pq-select-subject');
  const deptId = deptSelect.value;
  const subjectId = subjectSelect.value;

  if (!deptId || !subjectId) {
    alert("Vui lòng chọn Khoa và Môn học trước khi nhập tệp!");
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const arrayBuffer = e.target.result;
    mammoth.extractRawText({ arrayBuffer: arrayBuffer })
      .then(function(result) {
        const text = result.value;
        const importedQuestions = parseQuestionsFromText(text, deptId, subjectId);
        if (importedQuestions.length === 0) {
          alert("Không tìm thấy câu hỏi hợp lệ trong file Word! Vui lòng kiểm tra lại định dạng.");
          return;
        }

        personalQuestions.push(...importedQuestions);
        savePersonalQuestions();
        alert(`Đã nhập thành công ${importedQuestions.length} câu hỏi từ file Word!`);
        
        if (document.getElementById('personal-practice-subject').value === subjectId) {
          loadPersonalPracticeQuestions();
        }
      })
      .catch(function(err) {
        console.error(err);
        alert("Lỗi khi đọc file Word: " + err.message);
      });
  };
  reader.readAsArrayBuffer(file);
  event.target.value = '';
}

function parseQuestionsFromText(text, deptId, subjectId) {
  const qList = [];
  const parts = text.split(/(?=Câu\s+\d+[:\.\s])/i);

  parts.forEach(part => {
    part = part.trim();
    if (!part) return;

    const matchQ = part.match(/^Câu\s+\d+[:\.\s]+([\s\S]*?)(?=(?:[A-D]\.\s|Đáp\s*án|Giải\s*thích|Từ\s*khóa|Barem))/i);
    if (!matchQ) return;
    let questionText = matchQ[1].trim();
    questionText = questionText.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();

    let type = 'choice';
    if (part.includes('Từ khóa') || part.includes('Từ khóa cốt lõi')) {
      type = 'interview';
    } else if (part.includes('Đáp án mẫu') || part.includes('Barem điểm')) {
      type = 'essay';
    }

    const qObj = {
      id: 'pq_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      type: type,
      deptId: deptId,
      subjectId: subjectId,
      question: questionText,
      explanation: ''
    };

    if (type === 'choice') {
      qObj.options = { A: '', B: '', C: '', D: '' };
      
      const optAMatch = part.match(/A\.\s*([\s\S]*?)(?=(?:[B-D]\.\s|Đáp\s*án|Giải\s*thích))/i);
      const optBMatch = part.match(/B\.\s*([\s\S]*?)(?=(?:[C-D]\.\s|Đáp\s*án|Giải\s*thích))/i);
      const optCMatch = part.match(/C\.\s*([\s\S]*?)(?=(?:D\.\s|Đáp\s*án|Giải\s*thích))/i);
      const optDMatch = part.match(/D\.\s*([\s\S]*?)(?=(?:Đáp\s*án|Giải\s*thích))/i);

      if (optAMatch) qObj.options.A = optAMatch[1].trim().replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
      if (optBMatch) qObj.options.B = optBMatch[1].trim().replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
      if (optCMatch) qObj.options.C = optCMatch[1].trim().replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
      if (optDMatch) qObj.options.D = optDMatch[1].trim().replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');

      const correctMatch = part.match(/Đáp\s*án\s*[:\-]?\s*([A-D])/i);
      qObj.correct = correctMatch ? correctMatch[1].toUpperCase() : 'A';
    } else {
      const sampleMatch = part.match(/Đáp\s*án\s*mẫu\s*[:\-]?\s*([\s\S]*?)(?=(?:Barem\s*điểm|Từ\s*khóa|Giải\s*thích|$))/i);
      qObj.sampleAnswer = sampleMatch ? sampleMatch[1].trim() : '';

      const baremMatch = part.match(/Barem\s*điểm\s*[:\-]?\s*([\s\S]*?)(?=(?:Từ\s*khóa|Giải\s*thích|$))/i);
      qObj.barem = baremMatch ? baremMatch[1].trim() : '';

      if (type === 'interview') {
        const keywordsMatch = part.match(/(?:Từ\s*khóa|Từ\s*khóa\s*cốt\s*lõi)\s*[:\-]?\s*([\s\S]*?)(?=(?:Giải\s*thích|$))/i);
        const kwVal = keywordsMatch ? keywordsMatch[1].trim() : '';
        qObj.keywords = kwVal ? kwVal.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) : [];
      }
    }

    const explanationMatch = part.match(/Giải\s*thích\s*[:\-]?\s*([\s\S]*?)$/i);
    if (explanationMatch) {
      qObj.explanation = explanationMatch[1].trim();
    }

    qList.push(qObj);
  });

  return qList;
}

function importPersonalExcel(event) {
  const file = event.target.files[0];
  if (!file) return;

  const deptSelect = document.getElementById('pq-select-dept');
  const subjectSelect = document.getElementById('pq-select-subject');
  const deptId = deptSelect.value;
  const subjectId = subjectSelect.value;

  if (!deptId || !subjectId) {
    alert("Vui lòng chọn Khoa và Môn học trước khi nhập tệp!");
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonRows = XLSX.utils.sheet_to_json(worksheet);

    if (jsonRows.length === 0) {
      alert("Không tìm thấy dòng dữ liệu nào trong file Excel!");
      return;
    }

    const importedQuestions = [];
    jsonRows.forEach(row => {
      const getVal = (keys) => {
        for (let k of keys) {
          if (row[k] !== undefined) return String(row[k]).trim();
        }
        return '';
      };

      const rawType = getVal(['Loại câu hỏi', 'Loại', 'Type', 'loai_cau_hoi', 'loai']).toLowerCase();
      let type = 'choice';
      if (rawType.includes('tự luận') || rawType === 'essay') {
        type = 'essay';
      } else if (rawType.includes('vấn đáp') || rawType === 'interview') {
        type = 'interview';
      }

      const questionText = getVal(['Nội dung câu hỏi', 'Câu hỏi', 'Nội dung', 'Question', 'cau_hoi']);
      if (!questionText) return;

      const qObj = {
        id: 'pq_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        type: type,
        deptId: deptId,
        subjectId: subjectId,
        question: questionText,
        explanation: getVal(['Giải thích', 'Explanation', 'giai_thich'])
      };

      if (type === 'choice') {
        qObj.options = {
          A: getVal(['Đáp án A', 'Lựa chọn A', 'A', 'Option A', 'dap_an_a']),
          B: getVal(['Đáp án B', 'Lựa chọn B', 'B', 'Option B', 'dap_an_b']),
          C: getVal(['Đáp án C', 'Lựa chọn C', 'C', 'Option C', 'dap_an_c']),
          D: getVal(['Đáp án D', 'Lựa chọn D', 'D', 'Option D', 'dap_an_d'])
        };
        const correctVal = getVal(['Đáp án đúng', 'Đáp án', 'Correct', 'dap_an_dung', 'dap_an']).toUpperCase();
        qObj.correct = ['A', 'B', 'C', 'D'].includes(correctVal) ? correctVal : 'A';
      } else {
        qObj.sampleAnswer = getVal(['Đáp án mẫu', 'Gợi ý trả lời', 'Sample Answer', 'dap_an_mau']);
        qObj.barem = getVal(['Barem điểm', 'Barem', 'Barem Score', 'barem_diem', 'barem']);
        if (type === 'interview') {
          const kwVal = getVal(['Từ khóa cốt lõi', 'Từ khóa', 'Keywords', 'tu_khoa']);
          qObj.keywords = kwVal ? kwVal.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) : [];
        }
      }

      importedQuestions.push(qObj);
    });

    if (importedQuestions.length === 0) {
      alert("Không tìm thấy câu hỏi hợp lệ nào trong file Excel!");
      return;
    }

    personalQuestions.push(...importedQuestions);
    savePersonalQuestions();
    alert(`Đã nhập thành công ${importedQuestions.length} câu hỏi từ file Excel!`);

    if (document.getElementById('personal-practice-subject').value === subjectId) {
      loadPersonalPracticeQuestions();
    }
  };
  reader.readAsArrayBuffer(file);
  event.target.value = '';
}

// --- 10.3 Điều khiển Bộ lọc & Chọn môn học Cá nhân ---
function onPersonalAddDeptChange() {
  const deptId = document.getElementById('pq-select-dept').value;
  const subjectSelect = document.getElementById('pq-select-subject');
  subjectSelect.innerHTML = '<option value="" disabled selected>Chọn môn học...</option>';
  
  if (departments[deptId] && departments[deptId].subjects) {
    departments[deptId].subjects.forEach(sub => {
      const opt = document.createElement('option');
      opt.value = sub.id;
      opt.innerText = sub.name;
      subjectSelect.appendChild(opt);
    });
    subjectSelect.removeAttribute('disabled');
  } else {
    subjectSelect.setAttribute('disabled', 'true');
  }
  
  document.getElementById('pq-form-fields-container').classList.add('d-none');
}

function onPersonalAddSubjectChange() {
  const subjectId = document.getElementById('pq-select-subject').value;
  if (subjectId) {
    document.getElementById('pq-form-fields-container').classList.remove('d-none');
    togglePersonalQFields();
  }
}

function resetPersonalQForm() {
  document.getElementById('add-personal-q-form').reset();
  document.getElementById('pq-select-subject').innerHTML = '<option value="" disabled selected>Chọn môn học...</option>';
  document.getElementById('pq-select-subject').setAttribute('disabled', 'true');
  document.getElementById('pq-form-fields-container').classList.add('d-none');
  
  const preview = document.getElementById('pq-graphic-preview');
  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
  const placeholder = document.getElementById('pq-graphic-preview-placeholder');
  if (placeholder) placeholder.style.display = 'block';
  const base64 = document.getElementById('pq-graphic-image-base64');
  if (base64) base64.value = '';
}

function onPersonalPracticeDeptChange() {
  const deptId = document.getElementById('personal-practice-dept').value;
  const subjectSelect = document.getElementById('personal-practice-subject');
  subjectSelect.innerHTML = '<option value="" disabled selected>Chọn môn học...</option>';
  
  if (departments[deptId] && departments[deptId].subjects) {
    departments[deptId].subjects.forEach(sub => {
      const opt = document.createElement('option');
      opt.value = sub.id;
      opt.innerText = sub.name;
      subjectSelect.appendChild(opt);
    });
    subjectSelect.removeAttribute('disabled');
  } else {
    subjectSelect.setAttribute('disabled', 'true');
  }
  
  document.getElementById('personal-practice-display').innerHTML = `
    <div class="text-center py-5 my-5 text-secondary">
      <i class="bi bi-arrow-left-right fs-1 d-block mb-3 text-info"></i>
      <h4 class="text-light">Luyện tập câu hỏi cá nhân</h4>
      <p class="small max-w-400 mx-auto">Vui lòng chọn Môn học chuyên ngành bên trái để hiển thị danh sách câu hỏi.</p>
    </div>
  `;
}

function onPersonalPracticeSubjectChange() {
  loadPersonalPracticeQuestions();
}

function loadPersonalPracticeQuestions() {
  const display = document.getElementById('personal-practice-display');
  const subjectId = document.getElementById('personal-practice-subject').value;
  const deptId = document.getElementById('personal-practice-dept').value;
  
  if (!subjectId) return;

  const list = personalQuestions.filter(q => q.deptId === deptId && q.subjectId === subjectId);
  
  if (list.length === 0) {
    display.innerHTML = `
      <div class="text-center py-5 my-5 text-secondary">
        <i class="bi bi-inbox fs-1 d-block mb-3 text-warning"></i>
        <h4 class="text-light">Không có câu hỏi cá nhân nào</h4>
        <p class="small max-w-400 mx-auto">Chưa có câu hỏi ôn tập cá nhân nào cho môn học này. Hãy sang tab "Thêm câu hỏi" để tạo mới hoặc nhập từ tệp.</p>
      </div>
    `;
    return;
  }

  let html = `
    <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2 text-start">
      <h4 class="h5 fw-bold text-light m-0"><i class="bi bi-list-task text-info me-2"></i>Danh sách câu hỏi (${list.length})</h4>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-success rounded-pill px-3 fw-bold" onclick="uploadPersonalQuestionsToSystem('${deptId}', '${subjectId}')">
          <i class="bi bi-cloud-arrow-up-fill me-1"></i>Đăng tải lên hệ thống
        </button>
        <button class="btn btn-sm btn-outline-danger rounded-pill px-3 fw-bold" onclick="clearPersonalSubjectQuestions('${deptId}', '${subjectId}')">
          <i class="bi bi-trash3 me-1"></i>Xóa tất cả
        </button>
      </div>
    </div>
    <div class="d-flex flex-column gap-3 overflow-y-auto pr-1" style="max-height: calc(100vh - 280px);">
  `;

  list.forEach((q, idx) => {
    let typeLabel = 'Trắc nghiệm';
    let typeClass = 'bg-primary-glass text-info';
    if (q.type === 'essay') {
      typeLabel = 'Tự luận';
      typeClass = 'bg-purple-glass text-purple-light';
    } else if (q.type === 'interview') {
      typeLabel = 'Vấn đáp';
      typeClass = 'bg-success-glass text-success';
    } else if (q.type === 'graphic') {
      typeLabel = 'Họa hình';
      typeClass = 'bg-warning-glass text-warning';
    }

    html += `
      <div class="card bg-dark-glass border-secondary p-3 rounded-3 text-start">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div>
            <span class="badge ${typeClass} mb-2">${typeLabel}</span>
            <h5 class="text-light h6 fw-semibold mb-1" style="line-height: 1.4;">${idx + 1}. ${q.question}</h5>
          </div>
          <button class="btn btn-sm text-danger border-0 p-1" onclick="deleteSpecificPersonalQuestion('${q.id}')" title="Xóa câu hỏi">
            <i class="bi bi-trash fs-5"></i>
          </button>
        </div>
        
        <div class="mt-3 d-flex gap-2">
          <button class="btn btn-sm btn-info text-dark rounded-pill px-3 fw-bold" onclick="startPracticeQInPlace('${q.id}')">
            <i class="bi bi-play-circle-fill me-1"></i>Luyện tập
          </button>
        </div>
        
        <div id="practice-workspace-${q.id}" class="mt-3 p-3 bg-black bg-opacity-20 border border-secondary rounded-3 d-none">
        </div>
      </div>
    `;
  });

  html += `</div>`;
  display.innerHTML = html;
}

function uploadPersonalQuestionsToSystem(deptId, subjectId) {
  const list = personalQuestions.filter(q => q.deptId === deptId && q.subjectId === subjectId);
  if (list.length === 0) {
    alert("Không có câu hỏi cá nhân nào để đăng tải!");
    return;
  }

  const examName = prompt("Nhập tên đề thi mới của bạn:");
  if (examName === null) return;
  if (examName.trim() === '') {
    alert("Tên đề thi không được để trống!");
    return;
  }

  const newExam = {
    id: 'ex_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    year: examName.trim(),
    name: examName.trim(),
    uploader: currentUser ? currentUser.username : 'anonymous',
    uploaderName: currentUser ? currentUser.name : 'Học viên ẩn danh',
    questions: list.map((q, idx) => {
      const sq = {
        id: 'q_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substr(2, 9),
        type: q.type,
        question: q.question,
        explanation: q.explanation || ''
      };
      if (q.type === 'choice') {
        sq.options = q.options || { A: '', B: '', C: '', D: '' };
        sq.correct = q.correct || 'A';
      } else if (q.type === 'essay') {
        sq.sampleAnswer = q.sampleAnswer || '';
        sq.barem = q.barem || '';
      } else if (q.type === 'interview') {
        sq.sampleAnswer = q.sampleAnswer || '';
        sq.barem = q.barem || '';
        sq.keywords = q.keywords || [];
      } else if (q.type === 'graphic') {
        sq.image = q.image || '';
        sq.line = q.line || false;
        sq.erase = q.erase || false;
        sq.tmtc = q.tmtc || false;
      }
      return sq;
    })
  };

  const subject = departments[deptId] && departments[deptId].subjects ? departments[deptId].subjects.find(s => s.id === subjectId) : null;
  if (subject) {
    if (!subject.exams) subject.exams = [];
    subject.exams.push(newExam);
    saveDepartments();
    alert(`Đã đăng tải bộ câu hỏi thành công thành đề thi "${newExam.name}" trên hệ thống!`);
  } else {
    alert("Không tìm thấy môn học tương ứng trên hệ thống!");
  }
}

function deleteSpecificPersonalQuestion(qId) {
  if (confirm("Bạn có chắc chắn muốn xóa câu hỏi này khỏi danh sách ôn tập cá nhân?")) {
    personalQuestions = personalQuestions.filter(q => q.id !== qId);
    savePersonalQuestions();
    loadPersonalPracticeQuestions();
  }
}

function clearPersonalSubjectQuestions(deptId, subjectId) {
  if (confirm("Bạn có chắc chắn muốn xóa TẤT CẢ câu hỏi ôn tập cá nhân của môn học này?")) {
    personalQuestions = personalQuestions.filter(q => !(q.deptId === deptId && q.subjectId === subjectId));
    savePersonalQuestions();
    loadPersonalPracticeQuestions();
  }
}

// --- 10.4 Họa hình Preview ---
function onGraphicImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64 = e.target.result;
    document.getElementById('pq-graphic-image-base64').value = base64;
    
    const preview = document.getElementById('pq-graphic-preview');
    preview.src = base64;
    preview.style.display = 'block';
    
    const placeholder = document.getElementById('pq-graphic-preview-placeholder');
    if (placeholder) placeholder.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

// --- 10.5 Chạy Luyện tập Tại chỗ (In-place) ---
function startPracticeQInPlace(qId) {
  const workspace = document.getElementById(`practice-workspace-${qId}`);
  if (!workspace) return;

  if (!workspace.classList.contains('d-none')) {
    workspace.classList.add('d-none');
    workspace.innerHTML = '';
    return;
  }

  document.querySelectorAll('[id^="practice-workspace-"]').forEach(el => {
    el.classList.add('d-none');
    el.innerHTML = '';
  });

  workspace.classList.remove('d-none');
  const q = personalQuestions.find(item => item.id === qId);
  if (!q) return;

  let workspaceHtml = '';

  if (q.type === 'choice') {
    workspaceHtml = `
      <p class="text-secondary small mb-2"><i class="bi bi-info-circle me-1"></i>Chọn đáp án đúng dưới đây:</p>
      <div class="d-flex flex-column gap-2 mb-3">
        ${Object.entries(q.options).map(([opt, val]) => `
          <button class="btn btn-outline-light text-start border-secondary bg-dark-glass p-2 rounded-3 small w-100" id="practice-opt-${qId}-${opt}" onclick="checkPracticeChoice('${qId}', '${opt}')">
            <strong>${opt}.</strong> ${val}
          </button>
        `).join('')}
      </div>
      <div id="practice-choice-result-${qId}" class="alert alert-info py-2 d-none small"></div>
      <div id="practice-explanation-${qId}" class="mt-2 text-info small d-none" style="white-space: pre-wrap;">
        <strong>Giải thích:</strong><br>${q.explanation || 'Chưa có giải thích cho câu hỏi này.'}
      </div>
    `;
    workspace.innerHTML = workspaceHtml;
  } else if (q.type === 'essay') {
    workspaceHtml = `
      <div class="mb-3">
        <label class="form-label text-secondary small">Nhập bài giải tự luận của bạn:</label>
        <textarea class="form-control bg-dark-glass text-light border-secondary small" id="practice-essay-ans-${qId}" rows="4" placeholder="Nhập bài giải tại đây..."></textarea>
      </div>
      <div class="d-flex gap-2 justify-content-end mb-3">
        <button class="btn btn-sm btn-info text-dark rounded-pill px-3 fw-bold" id="practice-essay-btn-${qId}" onclick="submitPracticeEssay('${qId}')">
          <i class="bi bi-robot me-1"></i>AI Chấm Điểm
        </button>
      </div>
      <div id="practice-essay-ai-loading-${qId}" class="text-center py-3 d-none text-info">
        <div class="spinner-border spinner-border-sm me-2" role="status"></div>
        AI đang chấm điểm, vui lòng chờ...
      </div>
      <div id="practice-essay-result-${qId}" class="alert alert-info p-3 d-none text-start">
      </div>
    `;
    workspace.innerHTML = workspaceHtml;
  } else if (q.type === 'interview') {
    workspaceHtml = `
      <div class="mb-3 text-center">
        <p class="text-secondary small mb-2"><i class="bi bi-mic me-1"></i>Bấm nút Micro để ghi âm câu trả lời:</p>
        <div class="d-flex justify-content-center align-items-center gap-3">
          <button class="btn btn-danger btn-circle" id="practice-mic-btn-${qId}" onclick="togglePracticeQSpeech('${qId}')" style="width: 50px; height: 50px; border-radius: 50%; border: none;">
            <i class="bi bi-mic-fill fs-4"></i>
          </button>
          <div class="recording-pulse d-none" id="practice-mic-pulse-${qId}"></div>
        </div>
        <textarea class="form-control bg-dark-glass text-light border-secondary small mt-3" id="practice-speech-ans-${qId}" rows="3" placeholder="Giọng nói của bạn sau khi nhận diện sẽ hiển thị ở đây..."></textarea>
      </div>
      <div class="d-flex gap-2 justify-content-end mb-3">
        <button class="btn btn-sm btn-info text-dark rounded-pill px-3 fw-bold" id="practice-interview-btn-${qId}" onclick="submitPracticeInterview('${qId}')" disabled>
          <i class="bi bi-robot me-1"></i>AI Chấm Điểm
        </button>
      </div>
      <div id="practice-interview-ai-loading-${qId}" class="text-center py-3 d-none text-info">
        <div class="spinner-border spinner-border-sm me-2" role="status"></div>
        AI đang chấm điểm, vui lòng chờ...
      </div>
      <div id="practice-interview-result-${qId}" class="alert alert-info p-3 d-none text-start">
      </div>
    `;
    workspace.innerHTML = workspaceHtml;
  } else if (q.type === 'graphic') {
    workspaceHtml = `
      <p class="text-secondary small mb-2"><i class="bi bi-info-circle me-1"></i>Click nút dưới đây để vẽ trên màn hình lớn:</p>
      <button class="btn btn-warning text-dark rounded-pill px-4 fw-bold" onclick="openGraphicDrawingWorkspace('${qId}')">
        <i class="bi bi-brush me-1"></i>Mở màn hình vẽ Họa hình
      </button>
    `;
    workspace.innerHTML = workspaceHtml;
  }
}

function checkPracticeChoice(qId, selectedOpt) {
  const q = personalQuestions.find(item => item.id === qId);
  if (!q) return;

  const resultDiv = document.getElementById(`practice-choice-result-${qId}`);
  const explanationDiv = document.getElementById(`practice-explanation-${qId}`);
  
  // Highlight buttons
  Object.keys(q.options).forEach(opt => {
    const btn = document.getElementById(`practice-opt-${qId}-${opt}`);
    if (btn) {
      btn.setAttribute('disabled', 'true');
      if (opt === q.correct) {
        btn.className = 'btn btn-success text-start text-light p-2 rounded-3 small w-100 fw-bold border-success';
      } else if (opt === selectedOpt) {
        btn.className = 'btn btn-danger text-start text-light p-2 rounded-3 small w-100 fw-bold border-danger';
      }
    }
  });

  resultDiv.classList.remove('d-none');
  explanationDiv.classList.remove('d-none');

  if (selectedOpt === q.correct) {
    resultDiv.className = 'alert alert-success py-2 small';
    resultDiv.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i>Chính xác! Đáp án đúng là ' + q.correct;
  } else {
    resultDiv.className = 'alert alert-danger py-2 small';
    resultDiv.innerHTML = '<i class="bi bi-x-circle-fill me-1"></i>Không chính xác! Bạn đã chọn ' + selectedOpt + '. Đáp án đúng là ' + q.correct;
  }
}

async function submitPracticeEssay(qId) {
  const q = personalQuestions.find(item => item.id === qId);
  if (!q) return;

  const textarea = document.getElementById(`practice-essay-ans-${qId}`);
  const ansText = textarea.value.trim();
  if (!ansText) {
    alert("Vui lòng nhập câu trả lời của bạn!");
    return;
  }

  const btn = document.getElementById(`practice-essay-btn-${qId}`);
  const spinner = document.getElementById(`practice-essay-ai-loading-${qId}`);
  const resultDiv = document.getElementById(`practice-essay-result-${qId}`);

  btn.setAttribute('disabled', 'true');
  spinner.classList.remove('d-none');
  resultDiv.classList.add('d-none');

  try {
    const aiRes = await evaluateAnswerWithAI(q.question, q.sampleAnswer || '', q.barem || '', ansText, q.keywords || []);
    
    let circleClass = 'score-low';
    const scoreVal = parseFloat(aiRes.score);
    if (scoreVal >= 8.0) circleClass = 'score-high';
    else if (scoreVal >= 5.0) circleClass = 'score-medium';

    resultDiv.innerHTML = `
      <div class="d-flex align-items-center gap-3 mb-3 border-bottom border-secondary pb-3">
        <div class="ai-score-circle ${circleClass} m-0" style="width: 50px; height: 50px; font-size: 1.1rem; line-height: 50px;">
          <span>${aiRes.score}</span>
        </div>
        <div>
          <h6 class="text-light fw-bold m-0">Điểm AI: ${aiRes.score}/10</h6>
          <span class="text-secondary small">Hệ thống AI chấm điểm tự động</span>
        </div>
      </div>
      
      <div class="mb-3">
        <strong class="text-info small"><i class="bi bi-info-circle me-1"></i>Chi tiết barem đạt được:</strong>
        <p class="text-secondary-light small m-0 mt-1" style="white-space: pre-wrap;">${aiRes.barem_breakdown}</p>
      </div>

      <div class="mb-3">
        <strong class="text-info small"><i class="bi bi-chat-left-text me-1"></i>Phản hồi chi tiết của AI:</strong>
        <p class="text-secondary-light small m-0 mt-1" style="white-space: pre-wrap;">${aiRes.feedback}</p>
      </div>

      <div class="border-top border-secondary pt-2">
        <strong class="text-success small"><i class="bi bi-check-circle me-1"></i>Đáp án tham khảo:</strong>
        <p class="text-secondary-light small m-0 mt-1" style="white-space: pre-wrap;">${q.sampleAnswer || 'Chưa có đáp án tham khảo.'}</p>
      </div>
    `;

    resultDiv.classList.remove('d-none');
  } catch (err) {
    console.error(err);
    alert("Có lỗi xảy ra khi chấm bài: " + err.message);
  } finally {
    btn.removeAttribute('disabled');
    spinner.classList.add('d-none');
  }
}

let practiceRecognition = null;
function togglePracticeQSpeech(qId) {
  const micBtn = document.getElementById(`practice-mic-btn-${qId}`);
  const pulse = document.getElementById(`practice-mic-pulse-${qId}`);
  const textarea = document.getElementById(`practice-speech-ans-${qId}`);
  const gradeBtn = document.getElementById(`practice-interview-btn-${qId}`);

  if (practiceRecognition) {
    practiceRecognition.stop();
    practiceRecognition = null;
    micBtn.className = 'btn btn-danger btn-circle';
    pulse.classList.add('d-none');
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Trình duyệt của bạn không hỗ trợ Web Speech API. Vui lòng sử dụng Chrome hoặc Safari.");
    return;
  }

  practiceRecognition = new SpeechRecognition();
  practiceRecognition.lang = 'vi-VN';
  practiceRecognition.interimResults = true;
  practiceRecognition.continuous = true;

  practiceRecognition.onstart = () => {
    micBtn.className = 'btn btn-success btn-circle active';
    pulse.classList.remove('d-none');
  };

  practiceRecognition.onresult = (e) => {
    let resultText = '';
    for (let i = 0; i < e.results.length; i++) {
      resultText += e.results[i][0].transcript;
    }
    textarea.value = resultText;
    if (resultText.trim()) {
      gradeBtn.removeAttribute('disabled');
    }
  };

  practiceRecognition.onerror = (e) => {
    console.error(e);
    micBtn.className = 'btn btn-danger btn-circle';
    pulse.classList.add('d-none');
    practiceRecognition = null;
  };

  practiceRecognition.onend = () => {
    micBtn.className = 'btn btn-danger btn-circle';
    pulse.classList.add('d-none');
    practiceRecognition = null;
  };

  practiceRecognition.start();
}

async function submitPracticeInterview(qId) {
  const q = personalQuestions.find(item => item.id === qId);
  if (!q) return;

  const textarea = document.getElementById(`practice-speech-ans-${qId}`);
  const ansText = textarea.value.trim();
  if (!ansText) return;

  const btn = document.getElementById(`practice-interview-btn-${qId}`);
  const spinner = document.getElementById(`practice-interview-ai-loading-${qId}`);
  const resultDiv = document.getElementById(`practice-interview-result-${qId}`);

  btn.setAttribute('disabled', 'true');
  spinner.classList.remove('d-none');
  resultDiv.classList.add('d-none');

  try {
    const aiRes = await evaluateAnswerWithAI(q.question, q.sampleAnswer || '', q.barem || '', ansText, q.keywords || []);
    
    let circleClass = 'score-low';
    const scoreVal = parseFloat(aiRes.score);
    if (scoreVal >= 8.0) circleClass = 'score-high';
    else if (scoreVal >= 5.0) circleClass = 'score-medium';

    resultDiv.innerHTML = `
      <div class="d-flex align-items-center gap-3 mb-3 border-bottom border-secondary pb-3">
        <div class="ai-score-circle ${circleClass} m-0" style="width: 50px; height: 50px; font-size: 1.1rem; line-height: 50px;">
          <span>${aiRes.score}</span>
        </div>
        <div>
          <h6 class="text-light fw-bold m-0">Điểm AI: ${aiRes.score}/10</h6>
          <span class="text-secondary small">Phân tích tiếng nói và chấm điểm tự động</span>
        </div>
      </div>
      
      <div class="mb-3">
        <strong class="text-info small"><i class="bi bi-robot me-1"></i>Đánh giá độ trôi chảy & chuẩn xác:</strong>
        <div class="row g-2 mt-1">
          <div class="col-6">
            <div class="p-2 rounded bg-black bg-opacity-20 text-center">
              <span class="text-secondary d-block" style="font-size: 0.7rem;">ĐỘ TRÔI CHẢY</span>
              <strong class="text-success small">${aiRes.fluency || 'Đạt'}</strong>
            </div>
          </div>
          <div class="col-6">
            <div class="p-2 rounded bg-black bg-opacity-20 text-center">
              <span class="text-secondary d-block" style="font-size: 0.7rem;">ĐỘ CHÍNH XÁC PHÁT ÂM</span>
              <strong class="text-success small">${aiRes.accuracy || 'Đạt'}</strong>
            </div>
          </div>
        </div>
      </div>

      <div class="mb-3">
        <strong class="text-info small"><i class="bi bi-info-circle me-1"></i>Chi tiết barem đạt được:</strong>
        <p class="text-secondary-light small m-0 mt-1" style="white-space: pre-wrap;">${aiRes.barem_breakdown}</p>
      </div>

      <div class="mb-3">
        <strong class="text-info small"><i class="bi bi-chat-left-text me-1"></i>Phản hồi chi tiết của AI:</strong>
        <p class="text-secondary-light small m-0 mt-1" style="white-space: pre-wrap;">${aiRes.feedback}</p>
      </div>

      <div class="border-top border-secondary pt-2">
        <strong class="text-success small"><i class="bi bi-check-circle me-1"></i>Đáp án tham khảo:</strong>
        <p class="text-secondary-light small m-0 mt-1" style="white-space: pre-wrap;">${q.sampleAnswer || 'Chưa có đáp án tham khảo.'}</p>
      </div>
    `;

    resultDiv.classList.remove('d-none');
  } catch (err) {
    console.error(err);
    alert("Có lỗi xảy ra khi chấm bài: " + err.message);
  } finally {
    btn.removeAttribute('disabled');
    spinner.classList.add('d-none');
  }
}

function loadSubjectComments(subjectId) {
  const container = document.getElementById('subject-comments-feed');
  if (!container) return;
  container.innerHTML = '';

  const subjectComments = comments[subjectId] || [];
  if (subjectComments.length === 0) {
    container.innerHTML = '<div class="text-secondary small text-center py-3">Chưa có bình luận hay thảo luận nào cho môn học này. Hãy gửi ý kiến đầu tiên của bạn!</div>';
    return;
  }

  subjectComments.forEach(c => {
    const showDelete = (currentUser && (currentUser.role === 'super_admin' || currentUser.role === 'development' || currentUser.username === c.username));
    const deleteBtnHtml = showDelete ? `
      <button type="button" class="btn btn-sm btn-outline-danger border-0 py-0 px-1 float-end" onclick="deleteSubjectComment('${subjectId}', '${c.id}')" title="Xóa bình luận">
        <i class="bi bi-trash"></i>
      </button>
    ` : '';

    const div = document.createElement('div');
    div.className = 'border-bottom border-secondary-subtle py-2 text-start';
    div.innerHTML = `
      ${deleteBtnHtml}
      <div class="d-flex align-items-center gap-2 mb-1">
        <span class="fw-bold text-info small">${c.userName}</span>
        <span class="badge bg-dark-glass border border-secondary text-secondary-light px-2" style="font-size: 0.7rem;">${c.userRole === 'super_admin' ? 'Cán bộ' : (c.userRole === 'development' ? 'Developer' : 'Học viên')}</span>
        <span class="text-secondary small" style="font-size: 0.75rem;">${c.date}</span>
      </div>
      <p class="text-light m-0 small" style="white-space: pre-wrap;">${c.text}</p>
    `;
    container.appendChild(div);
  });
}

function postSubjectComment(event) {
  if (event) event.preventDefault();
  const textInput = document.getElementById('comment-text');
  if (!textInput) return;
  const text = textInput.value.trim();
  if (!text) return;

  const subjectId = systemState.currentSubjectId;
  if (!subjectId) return;

  if (!comments[subjectId]) {
    comments[subjectId] = [];
  }

  const newComment = {
    id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    username: currentUser.username,
    userName: currentUser.name,
    userRole: currentUser.role,
    text: text,
    date: new Date().toLocaleString('vi-VN', { hour12: false }).replace(/\//g, '-')
  };

  comments[subjectId].push(newComment);
  textInput.value = '';
  saveComments();
  loadSubjectComments(subjectId);
}

function deleteSubjectComment(subjectId, commentId) {
  if (confirm("Bạn có chắc chắn muốn xóa bình luận này khỏi hệ thống?")) {
    if (comments[subjectId]) {
      comments[subjectId] = comments[subjectId].filter(c => c.id !== commentId);
      saveComments();
      loadSubjectComments(subjectId);
    }
  }
}

// --- 10.8 Thay đổi Họ và Tên ---
function openEditProfileNameModal() {
  if (!currentUser) return;
  document.getElementById('ep-full-name').value = currentUser.name || '';
  const modal = new bootstrap.Modal(document.getElementById('editProfileNameModal'));
  modal.show();
}

function handleSaveProfileName(event) {
  if (event) event.preventDefault();
  const newName = document.getElementById('ep-full-name').value.trim();
  if (!newName) {
    alert("Vui lòng nhập họ và tên hợp lệ!");
    return;
  }

  // Cập nhật local
  currentUser.name = newName;
  document.getElementById('user-display-name').innerText = newName;

  // Cập nhật trong mảng accounts
  const accIdx = accounts.findIndex(acc => acc.username === currentUser.username);
  if (accIdx !== -1) {
    accounts[accIdx].name = newName;
    saveAccounts();
  }

  // Ẩn modal
  const modalEl = document.getElementById('editProfileNameModal');
  const modalInstance = bootstrap.Modal.getInstance(modalEl);
  if (modalInstance) modalInstance.hide();

  alert("Đã thay đổi họ và tên thành công!");
}

// --- 10.9 Chế độ Sáng/Tối ---
function applyTheme() {
  const savedTheme = localStorage.getItem('study_theme') || 'dark'; // mặc định là dark
  const body = document.body;
  const icon = document.getElementById('theme-toggle-icon');
  const sidebarThemeText = document.getElementById('sidebar-theme-text');
  const sidebarThemeIcon = document.getElementById('sidebar-theme-icon');
  
  if (savedTheme === 'dark') {
    body.classList.add('dark-mode');
    if (icon) {
      icon.className = 'bi bi-sun-fill text-warning';
    }
    if (sidebarThemeText) sidebarThemeText.innerText = 'Tối';
    if (sidebarThemeIcon) sidebarThemeIcon.className = 'bi bi-moon-stars-fill me-2 text-info';
  } else {
    body.classList.remove('dark-mode');
    if (icon) {
      icon.className = 'bi bi-moon-fill text-white';
    }
    if (sidebarThemeText) sidebarThemeText.innerText = 'Sáng';
    if (sidebarThemeIcon) sidebarThemeIcon.className = 'bi bi-sun-fill me-2 text-warning';
  }
}

function toggleTheme() {
  const body = document.body;
  const icon = document.getElementById('theme-toggle-icon');
  const sidebarThemeText = document.getElementById('sidebar-theme-text');
  const sidebarThemeIcon = document.getElementById('sidebar-theme-icon');
  
  if (body.classList.contains('dark-mode')) {
    body.classList.remove('dark-mode');
    localStorage.setItem('study_theme', 'light');
    if (icon) {
      icon.className = 'bi bi-moon-fill text-white';
    }
    if (sidebarThemeText) sidebarThemeText.innerText = 'Sáng';
    if (sidebarThemeIcon) sidebarThemeIcon.className = 'bi bi-sun-fill me-2 text-warning';
  } else {
    body.classList.add('dark-mode');
    localStorage.setItem('study_theme', 'dark');
    if (icon) {
      icon.className = 'bi bi-sun-fill text-warning';
    }
    if (sidebarThemeText) sidebarThemeText.innerText = 'Tối';
    if (sidebarThemeIcon) sidebarThemeIcon.className = 'bi bi-moon-stars-fill me-2 text-info';
  }
}

// --- 10.10 Khởi chạy ứng dụng ---
async function initializeApp() {
  applyTheme();
  await syncDataFromServer();
  
  const savedUser = localStorage.getItem('study_current_user');
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      setupLoggedInUI(currentUser);
      const savedView = localStorage.getItem('study_current_view') || 'dashboard';
      navigateTo(savedView === 'login' ? 'dashboard' : savedView);
    } catch (e) {
      console.error("Lỗi khi khôi phục phiên đăng nhập:", e);
      navigateTo('login');
    }
  } else {
    navigateTo('login');
  }
}
initializeApp();

function checkForUpdates() {
  if (confirm("Hệ thống sẽ chuyển hướng bạn tới liên kết tải về phiên bản phần mềm (Desktop App) mới nhất. Bạn có muốn tiếp tục?")) {
    window.location.href = "/download/app";
  }
}

