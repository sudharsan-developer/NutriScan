/* =========================================================
   NutriScan AI — script.js
   Pure frontend behaviour. No backend calls are made here —
   see analyzeFood() below for exactly where to wire up your
   FastAPI endpoint.
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------------------------------------------------
     1. Sidebar (mobile drawer) + nav active state
  --------------------------------------------------- */
  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('sidebarScrim');
  const menuToggle = document.getElementById('menuToggle');
  const navLinks = document.querySelectorAll('.nav-link');

  function openSidebar() {
    sidebar.classList.add('open');
    scrim.classList.add('show');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    scrim.classList.remove('show');
  }

  menuToggle?.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  scrim?.addEventListener('click', closeSidebar);

  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      closeSidebar();
    });
  });

  /* ---------------------------------------------------
     2. Dark mode toggle (persisted in localStorage)
  --------------------------------------------------- */
  const root = document.documentElement;
  const themeBtnDesktop = document.getElementById('themeToggleDesktop');
  const themeBtnMobile = document.getElementById('themeToggleMobile');

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    localStorage.setItem('ns-theme', theme);
    if (themeBtnMobile) themeBtnMobile.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  const savedTheme = localStorage.getItem('ns-theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(savedTheme);

  function toggleTheme() {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  }
  themeBtnDesktop?.addEventListener('click', toggleTheme);
  themeBtnMobile?.addEventListener('click', toggleTheme);

  /* ---------------------------------------------------
     3. Upload: drag & drop + click + preview + scan line
  --------------------------------------------------- */
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const dropzoneIdle = document.getElementById('dropzoneIdle');
  const dropzonePreview = document.getElementById('dropzonePreview');
  const previewImg = document.getElementById('previewImg');
  const removeImageBtn = document.getElementById('removeImage');
  const scanLine = document.getElementById('scanLine');
  const uploadWarning = document.getElementById('uploadWarning');
  const heroUploadBtn = document.getElementById('heroUploadBtn');

  let hasImage = false;

  function showPreview(file) {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/avif'];
    if (!validTypes.includes(file.type) && !/\.(jpe?g|png|avif)$/i.test(file.name)) {
      alert('Please upload a JPG, JPEG, PNG, or AVIF image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      dropzoneIdle.hidden = true;
      dropzonePreview.hidden = false;
      hasImage = true;
      uploadWarning.hidden = true;
    };
    reader.readAsDataURL(file);
  }

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files[0]) showPreview(e.target.files[0]);
  });

  heroUploadBtn?.addEventListener('click', () => {
    document.getElementById('uploadCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
    fileInput.click();
  });

  ['dragenter', 'dragover'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });
  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) showPreview(file);
  });

  removeImageBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileInput.value = '';
    previewImg.src = '';
    dropzonePreview.hidden = true;
    dropzoneIdle.hidden = false;
    hasImage = false;
    scanLine.classList.remove('scanning');
  });

  /* ---------------------------------------------------
     4. Example chips fill the question textarea
  --------------------------------------------------- */
  const questionInput = document.getElementById('questionInput');
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      questionInput.value = chip.textContent;
      questionInput.focus();
    });
  });

  /* ---------------------------------------------------
     5. Count-up animation helper (for calories / macros)
  --------------------------------------------------- */
  function countUp(el, target, duration = 1200) {
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      el.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------------------------------------------------
     6. Typing effect helper (for AI summary line)
  --------------------------------------------------- */
  function typeText(el, text, speed = 22) {
    el.textContent = '';
    let i = 0;
    function tick() {
      if (i <= text.length) {
        el.textContent = text.slice(0, i);
        i++;
        setTimeout(tick, speed);
      } else {
        el.style.borderRight = 'none';
      }
    }
    tick();
  }

  /* ---------------------------------------------------
     7. Analyze flow
  --------------------------------------------------- */
  const analyzeBtn = document.getElementById('analyzeBtn');
  const analyzeBtnLabel = document.getElementById('analyzeBtnLabel');
  const submitLoader = document.getElementById('submitLoader');
  const resultWrap = document.getElementById('resultWrap');
  const resultFoodName = document.getElementById('resultFoodName');
  const resultSummary = document.getElementById('resultSummary');
  const calorieCount = document.getElementById('calorieCount');

  async function analyzeFood(imageFile, question) {
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('question', question);

    const apiBase = 'http://localhost:8001';
    const res = await fetch(`${apiBase}/analyze`, {
      method: 'POST',
      body: formData,
      mode: 'cors',
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || 'Analysis failed');
    }

    return res.json();
  }

  async function runAnalysis() {
    const question = questionInput.value.trim() || 'Analyze this food completely.';
    const fileInputEl = fileInput.files[0];

    analyzeBtnLabel.hidden = true;
    submitLoader.hidden = false;
    analyzeBtn.querySelector('.ai-icon').style.display = 'none';
    scanLine.classList.add('scanning');

    try {
      const data = await analyzeFood(fileInputEl, question);

      resultWrap.hidden = false;
      resultFoodName.textContent = data.foodName || 'Unknown';
      typeText(resultSummary, `“${question}” — ${data.summary || 'No summary available.'}`);
      countUp(calorieCount, data.calories || 0);

      document.querySelectorAll('.macro-value [data-count]').forEach((el, idx) => {
        const values = [data.protein || 0, data.carbs || 0, data.fat || 0, data.fiber || 0];
        countUp(el, values[idx], 1000);
      });

      const suggestionsList = document.getElementById('suggestionsList');
      suggestionsList.innerHTML = (data.suggestions || ['Add a side salad for balance.']).map(s => `<li>${s}</li>`).join('');

      const alternativesList = document.getElementById('alternativesList');
      alternativesList.innerHTML = (data.alternatives || ['Choose a lighter option']).map(a => `<span>${a}</span>`).join('');

      resultWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      alert(error.message || 'Analysis failed');
    } finally {
      submitLoader.hidden = true;
      analyzeBtnLabel.hidden = false;
      analyzeBtn.querySelector('.ai-icon').style.display = '';
      scanLine.classList.remove('scanning');
    }
  }

  analyzeBtn?.addEventListener('click', () => {
    if (!hasImage) {
      uploadWarning.hidden = false;
      document.getElementById('uploadCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    runAnalysis();
  });

  /* ---------------------------------------------------
     8. "Try Demo" button — loads a sample image + question
  --------------------------------------------------- */
  document.getElementById('tryDemoBtn')?.addEventListener('click', () => {
    // Simple inline SVG used as a placeholder "sample" image (no external asset needed).
    const sampleSvg = `data:image/svg+xml;utf8,${encodeURIComponent(`
      <svg xmlns='http://www.w3.org/2000/svg' width='600' height='400'>
        <rect width='600' height='400' fill='#eaf1ff'/>
        <circle cx='300' cy='200' r='120' fill='#17b978' opacity='0.35'/>
        <circle cx='230' cy='170' r='40' fill='#ff9f6b'/>
        <circle cx='340' cy='150' r='46' fill='#7fd8a3'/>
        <circle cx='370' cy='230' r='34' fill='#ffd166'/>
        <text x='50%' y='92%' dominant-baseline='middle' text-anchor='middle'
              font-family='sans-serif' font-size='16' fill='#4d635d'>Sample meal preview</text>
      </svg>`)}`;
    previewImg.src = sampleSvg;
    dropzoneIdle.hidden = true;
    dropzonePreview.hidden = false;
    hasImage = true;
    uploadWarning.hidden = true;
    questionInput.value = 'Is this healthy?';
    document.getElementById('uploadCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

});