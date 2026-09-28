/* PDF Study Hub - beginner-friendly client-side application */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  file: null, fileName: '', text: '', pages: 0, sections: [], questions: [], exam: null,
  reviewed: JSON.parse(localStorage.getItem('pdfHubReviewed') || '{}'),
  theme: localStorage.getItem('pdfHubTheme') || 'light',
  lastResult: JSON.parse(localStorage.getItem('pdfHubLastResult') || 'null')
};

if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
if (state.theme === 'dark') { document.body.classList.add('dark'); $('#darkModeSetting').checked = true; }

function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 3000); }
function escapeHTML(value) { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function cleanText(text) { return text.replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(); }
function sentences(text) { return text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim().replace(/^[•●▪–—-]\s*/, '')).filter(s => s.length >= 25 && s.length <= 300); }
function unique(list) { return [...new Set(list.map(x => x.trim()).filter(Boolean))]; }
function shorten(text, max = 180) { return text.length > max ? text.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : text; }
function shuffle(list) { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function formatBytes(bytes) { if (!bytes) return '0 KB'; return `${(bytes / 1024 / 1024).toFixed(2)} MB`; }

function showView(view) {
  $$('.view').forEach(el => el.classList.toggle('active', el.id === `${view}View`));
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  $('#pageTitle').textContent = view[0].toUpperCase() + view.slice(1);
  $('#sidebar').classList.remove('open');
  if (view === 'exam') updateAvailability();
  if (view === 'results') renderResults();
}

$$('.nav-item').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
$$('[data-view-target]').forEach(button => button.addEventListener('click', () => showView(button.dataset.viewTarget)));
$('#menuButton').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#themeToggle').addEventListener('click', toggleTheme);
$('#darkModeSetting').addEventListener('change', toggleTheme);
function toggleTheme() { state.theme = document.body.classList.toggle('dark') ? 'dark' : 'light'; localStorage.setItem('pdfHubTheme', state.theme); $('#darkModeSetting').checked = state.theme === 'dark'; }

$('#chooseFile').addEventListener('click', () => $('#pdfInput').click());
$('#dropZone').addEventListener('click', e => { if (e.target.closest('button')) return; $('#pdfInput').click(); });
$('#dropZone').addEventListener('dragover', e => { e.preventDefault(); $('#dropZone').classList.add('dragging'); });
$('#dropZone').addEventListener('dragleave', () => $('#dropZone').classList.remove('dragging'));
$('#dropZone').addEventListener('drop', e => { e.preventDefault(); $('#dropZone').classList.remove('dragging'); handleFile(e.dataTransfer.files[0]); });
$('#pdfInput').addEventListener('change', e => handleFile(e.target.files[0]));
$('#removeFile').addEventListener('click', resetDocument);

function handleFile(file) {
  if (!file) return;
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { toast('Please choose a PDF file.'); return; }
  state.file = file; state.fileName = file.name;
  $('#fileName').textContent = file.name; $('#fileSize').textContent = formatBytes(file.size);
  $('#selectedFile').classList.remove('hidden'); $('#analyzeButton').disabled = false;
  $('#dashboardStatus').textContent = 'Ready to analyze this document.';
}
function resetDocument() {
  state.file = null; state.fileName = ''; state.text = ''; state.sections = []; state.questions = []; state.exam = null;
  $('#pdfInput').value = ''; $('#selectedFile').classList.add('hidden'); $('#analyzeButton').disabled = true;
  ['pageCount','wordCount','topicCount'].forEach(id => $('#' + id).textContent = '—'); $('#dashboardStatus').textContent = 'Upload a text-based PDF to begin.'; $('#dashboardProgress').style.width = '0%';
  renderReviewer(); updateAvailability(); toast('Current document removed.');
}
$('#analyzeButton').addEventListener('click', analyzePDF);

async function analyzePDF() {
  if (!state.file || !window.pdfjsLib) { toast('PDF.js could not load. Check your internet connection.'); return; }
  $('#analyzeButton').disabled = true; $('#processingCard').classList.remove('hidden');
  const stages = [['Analyzing PDF...', 15], ['Extracting important topics...', 45], ['Creating reviewer...', 72], ['Preparing mock exam...', 90]];
  try {
    let pdf;
    try { pdf = await pdfjsLib.getDocument({ data: await state.file.arrayBuffer() }).promise; } catch (err) { throw new Error('This PDF could not be opened.'); }
    state.pages = pdf.numPages; let allPages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i); const content = await page.getTextContent();
      allPages.push(content.items.map(item => item.str).join(' '));
      setProcessing('Extracting text...', Math.round((i / pdf.numPages) * 35));
    }
    state.text = cleanText(allPages.join('\n'));
    if (state.text.length < 80) throw new Error('SCANNED_PDF');
    setProcessing(stages[1][0], stages[1][1]); await wait(120); state.sections = buildReviewer(state.text); setProcessing(stages[2][0], stages[2][1]); await wait(160); state.questions = buildQuestionBank(state.sections); setProcessing(stages[3][0], stages[3][1]); await wait(180);
    finishAnalysis(); toast(`Analysis complete — ${state.sections.length} topics and ${state.questions.length} questions ready.`);
  } catch (error) {
    $('#processingCard').classList.add('hidden'); $('#analyzeButton').disabled = false;
    toast(error.message === 'SCANNED_PDF' ? 'This PDF appears to contain scanned images. Text extraction is not available; try a text-based PDF or add OCR support.' : error.message);
  }
}
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function setProcessing(label, percent) { $('#processingLabel').textContent = label; $('#processingPercent').textContent = `${percent}%`; $('#processingProgress').style.width = `${percent}%`; }
function finishAnalysis() {
  $('#processingCard').classList.add('hidden'); $('#analyzeButton').disabled = false; $('#startReview').disabled = false; $('#generateExam').disabled = false;
  $('#documentTitle').textContent = state.fileName; $('#pageCount').textContent = state.pages; $('#wordCount').textContent = state.text.split(/\s+/).length.toLocaleString(); $('#topicCount').textContent = state.sections.length; $('#dashboardProgress').style.width = '100%'; $('#dashboardStatus').textContent = 'Ready for review and practice.';
  $('#reviewerSubtitle').textContent = `${state.fileName} · ${state.sections.length} organized sections`; renderReviewer(); updateAvailability(); saveSnapshot();
}

function buildReviewer(text) {
  const lines = text.split(/\n+/).map(x => x.trim()).filter(Boolean); const sent = sentences(text); const headings = lines.filter(x => x.length >= 3 && x.length <= 90 && !/[.!?]$/.test(x) && (x === x.toUpperCase() || /^[0-9]+[.)\s]|^(chapter|unit|lesson|topic|module)\b/i.test(x)));
  const chunks = headings.length ? headings.slice(0, 30) : ['Core concepts', 'Important details', 'Key facts'];
  const groups = chunks.map((title, i) => { const start = Math.floor(i * sent.length / chunks.length); const end = Math.floor((i + 1) * sent.length / chunks.length); return { title: shorten(title, 70), facts: sent.slice(start, Math.max(start + 3, end)).slice(0, 12) }; }).filter(s => s.facts.length);
  const all = sent; const definitions = all.filter(s => /\b(is|are|means|defined as|refers to|known as)\b/i.test(s)).slice(0, 12); const dates = all.filter(s => /\b(\d{4}|\d{1,2}[/-]\d{1,2}|January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(s)).slice(0, 12); const processes = all.filter(s => /\b(first|then|next|finally|process|steps?|procedure|begins|followed by)\b/i.test(s)).slice(0, 12); const names = all.filter(s => /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(s)).slice(0, 10);
  const sections = groups.map((g, i) => ({ id: `topic-${i}`, title: g.title || `Topic ${i + 1}`, facts: unique(g.facts), definitions: i === 0 ? unique(definitions) : [], dates: i === 0 ? unique(dates) : [], processes: i === 0 ? unique(processes) : [], names: i === 0 ? unique(names) : [] }));
  return sections.length ? sections : [{ id:'topic-0', title:'Extracted content', facts: unique(all).slice(0, 30), definitions:[],dates:[],processes:[],names:[] }];
}

function buildQuestionBank(sections) {
  const bank = []; const allFacts = unique(sections.flatMap(s => s.facts)).filter(s => s.length >= 30); const makeOptions = (answer, pool) => unique([answer, ...shuffle(pool.filter(x => x !== answer)).slice(0, 3)]).slice(0, 4);
  allFacts.forEach((fact, index) => {
    const def = fact.match(/^(.{2,70})\s+(?:is|are|means|refers to|is defined as)\s+(.{8,180})/i);
    if (def) { const answer = shorten(def[2], 115); const options = makeOptions(answer, allFacts.map(x => shorten(x.split(/\s+(?:is|are|means|refers to)\s+/i)[1] || x, 115))); if (options.length >= 2) bank.push({ id:`q-${bank.length}`, type:'Definition', prompt:`According to the PDF, what best completes this definition? “${shorten(def[1])} is… ”`, options, answer, source:fact, explanation:`The uploaded PDF states: “${shorten(fact)}”` }); }
    const date = fact.match(/\b(\d{4}|\d{1,2}[/-]\d{1,2}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*\d{4})?)\b/i);
    if (date) { const answer = date[1]; const distractors = unique(allFacts.map(x => (x.match(/\b(\d{4}|\d{1,2}[/-]\d{1,2})\b/) || [])[1]).filter(Boolean)); const options = makeOptions(answer, distractors); if (options.length >= 2) bank.push({id:`q-${bank.length}`,type:'Date',prompt:`According to the PDF, which date or year is mentioned in this statement? “${shorten(fact.replace(date[1],'_____'))}”`,options,answer,source:fact,explanation:`This is based directly on the date in the uploaded PDF: ${shorten(fact)}`}); }
    if (index % 2 === 0 && !def && !date) { const words = fact.split(/\s+/); const key = words.find(w => w.length >= 7 && /^[A-Za-z]+$/.test(w)); if (key) { const answer = key.replace(/[.,;:()]/g,''); const prompt = `Which term appears in the following PDF-based statement? “${shorten(fact.replace(key, '_____'))}”`; const options = makeOptions(answer, allFacts.flatMap(x => x.split(/\s+/).filter(w => w.length >= 7 && /^[A-Za-z]+$/.test(w))).map(x => x.replace(/[.,;:()]/g,''))); if (options.length >= 2) bank.push({id:`q-${bank.length}`,type:'Identification',prompt,options,answer,source:fact,explanation:`The answer is supported by this extracted sentence: “${shorten(fact)}”`}); } }
  });
  const seen = new Set(); return bank.filter(q => { const key = q.prompt.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return q.options.length >= 2; }).slice(0, 120);
}

function renderReviewer() {
  const container = $('#reviewerContent'); if (!state.sections.length) return;
  const query = ($('#reviewSearch')?.value || '').toLowerCase(); const filter = $('#topicFilter')?.value || 'all';
  $('#topicFilter').innerHTML = '<option value="all">All sections</option>' + state.sections.map(s => `<option value="${escapeHTML(s.id)}">${escapeHTML(s.title)}</option>`).join(''); $('#topicFilter').value = filter;
  const sections = state.sections.filter(s => filter === 'all' || s.id === filter).map(section => { const all = [...section.facts, ...section.definitions, ...section.dates, ...section.processes, ...section.names]; return {...section, facts: section.facts.filter(x => !query || x.toLowerCase().includes(query)), definitions: section.definitions.filter(x => !query || x.toLowerCase().includes(query)), dates: section.dates.filter(x => !query || x.toLowerCase().includes(query)), processes: section.processes.filter(x => !query || x.toLowerCase().includes(query)), names: section.names.filter(x => !query || x.toLowerCase().includes(query)), hasMatch: !query || all.some(x => x.toLowerCase().includes(query))}; }).filter(s => s.hasMatch);
  if (!sections.length) { container.innerHTML = '<div class="empty-state"><span>⌕</span><h3>No matching content</h3><p>Try a different keyword or section.</p></div>'; return; }
  container.innerHTML = sections.map((s, i) => `<details class="review-section" ${i === 0 ? 'open' : ''}><summary>${escapeHTML(s.title)}<label class="review-check"><input type="checkbox" data-review="${s.id}" ${state.reviewed[s.id] ? 'checked' : ''}> Reviewed</label></summary><div class="section-body">${reviewBlock('Key points', s.facts)}${reviewBlock('Definitions & terms', s.definitions)}${reviewBlock('Dates', s.dates)}${reviewBlock('Processes', s.processes)}${reviewBlock('Names & examples', s.names)}</div></details>`).join('');
  $$('[data-review]').forEach(input => input.addEventListener('change', e => { state.reviewed[e.target.dataset.review] = e.target.checked; localStorage.setItem('pdfHubReviewed', JSON.stringify(state.reviewed)); updateReviewProgress(); })); updateReviewProgress();
}
function reviewBlock(title, items) { if (!items.length) return ''; return `<h4>${title}</h4><ul>${items.map(x => `<li>${escapeHTML(x)}</li>`).join('')}</ul>`; }
function updateReviewProgress() { const total = state.sections.length; const done = state.sections.filter(s => state.reviewed[s.id]).length; const pct = total ? Math.round(done / total * 100) : 0; $('#reviewProgressText').textContent = `${pct}%`; $('#reviewProgressBar').style.width = `${pct}%`; }
$('#reviewSearch').addEventListener('input', renderReviewer); $('#topicFilter').addEventListener('change', renderReviewer); $('#reviewAllButton').addEventListener('click', () => { state.sections.forEach(s => state.reviewed[s.id] = true); localStorage.setItem('pdfHubReviewed', JSON.stringify(state.reviewed)); renderReviewer(); toast('All sections marked as reviewed.'); });

function updateAvailability() { $('#questionAvailability').textContent = state.questions.length ? `${state.questions.length} verified question candidates available from this PDF.` : 'Analyze a PDF first to generate questions.'; $('#buildExamButton').disabled = !state.questions.length; }
$('#buildExamButton').addEventListener('click', startExam);
function startExam() { const count = $('#questionCount').value === 'all' ? state.questions.length : Math.min(Number($('#questionCount').value), state.questions.length); let qs = $('#shuffleQuestions').checked ? shuffle(state.questions).slice(0, count) : state.questions.slice(0, count); const shuffleChoices = $('#shuffleChoices').checked; qs = qs.map(q => { const options = shuffleChoices ? shuffle(q.options) : [...q.options]; return {...q, options, answerIndex: options.indexOf(q.answer)}; }); state.exam = { questions: qs, current:0, answers:Array(qs.length).fill(null), submitted:false }; renderExam(); }
function renderExam() { const ex = state.exam; $('#examSetup').classList.add('hidden'); const wrap = $('#examWorkspace'); wrap.classList.remove('hidden'); const q = ex.questions[ex.current]; const answered = ex.answers.filter(x => x !== null).length; wrap.innerHTML = `<div class="exam-panel"><div class="exam-head"><div><p class="eyebrow accent">QUESTION ${ex.current + 1} OF ${ex.questions.length}</p><h3>Mock exam · ${escapeHTML(state.fileName)}</h3></div><span class="exam-progress-label">${answered} answered</span></div><div class="question-dots">${ex.questions.map((_,i) => `<button class="question-dot ${i===ex.current?'active':''} ${ex.answers[i]!==null?'answered':''}" data-jump="${i}">${i+1}</button>`).join('')}</div><div class="exam-question"><p class="eyebrow">${escapeHTML(q.type)} QUESTION</p><h3>${escapeHTML(q.prompt)}</h3><div class="choice-grid">${q.options.map((option,i) => `<label class="choice ${ex.answers[ex.current]===i?'selected':''}"><input type="radio" name="choice" value="${i}" ${ex.answers[ex.current]===i?'checked':''}><span class="choice-letter">${String.fromCharCode(65+i)}</span><span>${escapeHTML(option)}</span></label>`).join('')}</div></div><div class="exam-footer"><button class="secondary-button" id="prevQuestion" ${ex.current===0?'disabled':''}>← Previous</button><div class="exam-buttons"><button class="text-button" id="clearAnswer">Clear answer</button>${ex.current===ex.questions.length-1?'<button class="primary-button" id="submitExam">Submit exam ✓</button>':'<button class="primary-button" id="nextQuestion">Next →</button>'}</div></div></div>`;
  $$('.choice input').forEach(input => input.addEventListener('change', e => { ex.answers[ex.current] = Number(e.target.value); renderExam(); })); $('#prevQuestion')?.addEventListener('click', () => { ex.current--; renderExam(); }); $('#nextQuestion')?.addEventListener('click', () => { ex.current++; renderExam(); }); $('#clearAnswer')?.addEventListener('click', () => { ex.answers[ex.current] = null; renderExam(); }); $('#submitExam')?.addEventListener('click', submitExam); $$('[data-jump]').forEach(b => b.addEventListener('click', () => { ex.current = Number(b.dataset.jump); renderExam(); })); }
function submitExam() { if (!confirm('Submit this exam and see your score?')) return; const ex = state.exam; const correct = ex.questions.reduce((n,q,i) => n + (ex.answers[i] === q.answerIndex ? 1 : 0), 0); const unanswered = ex.answers.filter(x => x === null).length; state.lastResult = { score:correct,total:ex.questions.length,unanswered,questions:ex.questions.map((q,i) => ({...q,userIndex:ex.answers[i]})),date:new Date().toLocaleString() }; localStorage.setItem('pdfHubLastResult', JSON.stringify(state.lastResult)); renderResults(); showView('results'); toast('Exam submitted. Nice work.'); }

function renderResults() { const r = state.lastResult; const el = $('#resultsContent'); if (!r) { el.innerHTML = '<div class="empty-state"><span>◉</span><h3>No exam results yet</h3><p>Complete a mock exam to see your score and explanations.</p></div>'; return; } const pct = Math.round(r.score / r.total * 100); el.innerHTML = `<div class="result-summary"><div class="score-ring"><div><strong>${pct}%</strong><small>score</small></div></div><div><p class="eyebrow" style="color:#9dd6d0">LATEST RESULT · ${escapeHTML(r.date)}</p><h2 style="font:600 25px 'Space Grotesk';margin:6px 0">${r.score} / ${r.total} correct</h2><p style="color:#b5d5d5;font-size:12px;margin:0">${pct >= 80 ? 'Excellent recall. Keep building on it.' : 'Review the missed items and try again.'}</p></div><div class="result-stats"><div><strong>${r.score}</strong><span>Correct</span></div><div><strong>${r.total-r.score-r.unanswered}</strong><span>Wrong</span></div><div><strong>${r.unanswered}</strong><span>Unanswered</span></div></div></div><div class="result-list"><h3 style="font:600 17px 'Space Grotesk';margin:0 0 5px">Answer review</h3>${r.questions.map((q,i) => { const ok=q.userIndex===q.answerIndex; return `<div class="result-item"><strong>${i+1}. ${escapeHTML(q.prompt)}</strong><span class="${ok?'correct':'wrong'}">${ok?'Correct':'Needs review'}</span> · Your answer: ${q.userIndex===null?'Unanswered':escapeHTML(q.options[q.userIndex]||'—')} · Correct answer: ${escapeHTML(q.options[q.answerIndex])}<br><span class="muted">${escapeHTML(q.explanation)}</span></div>`; }).join('')}</div>`; }

function ensureContent(action) { if (!state.sections.length) { toast(`Analyze a PDF before you ${action}.`); return false; } return true; }
$('#downloadReviewer').addEventListener('click', downloadReviewer); $('#downloadMock').addEventListener('click', downloadMock); $('#downloadKey').addEventListener('click', downloadKey);
function getPDF() { if (!window.jspdf) { toast('PDF export library could not load.'); return null; } return new jspdf.jsPDF({unit:'pt',format:'a4'}); }
function addHeader(doc, title, subtitle) { doc.setFillColor(20,59,82); doc.rect(0,0,595,68,'F'); doc.setTextColor(255,255,255); doc.setFontSize(21); doc.text(title,40,35); doc.setFontSize(9); doc.text(subtitle,40,51); doc.setTextColor(23,33,43); }
function addWrapped(doc, text, x, y, width, size=10, color=[70,84,92]) { doc.setFontSize(size); doc.setTextColor(...color); const lines=doc.splitTextToSize(text,width); doc.text(lines,x,y); return y + lines.length*(size+4); }
function newPageIfNeeded(doc, y) { if (y > 760) { doc.addPage(); y=44; return y; } return y; }
function footerPages(doc) { const pages=doc.internal.getNumberOfPages(); for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFontSize(8);doc.setTextColor(120,135,140);doc.text(`PDF Study Hub · ${i} / ${pages}`,40,810); } }
function downloadReviewer() { if(!ensureContent('download the reviewer'))return; const doc=getPDF();if(!doc)return;addHeader(doc,'Study Reviewer',state.fileName);let y=100;state.sections.forEach((s,idx)=>{y=newPageIfNeeded(doc,y);doc.setFontSize(15);doc.setTextColor(24,150,126);doc.text(`${idx+1}. ${s.title}`,40,y);y+=22;[...s.facts,...s.definitions,...s.dates,...s.processes,...s.names].forEach(item=>{y=newPageIfNeeded(doc,y);y=addWrapped(doc,`• ${item}`,52,y,490,10)+7;});y+=10;});footerPages(doc);doc.save(`${state.fileName.replace(/\.pdf$/i,'')}-reviewer.pdf`); }
function downloadMock() { if(!state.exam?.questions?.length){toast('Create a mock exam before downloading it.');return;}const doc=getPDF();if(!doc)return;addHeader(doc,'Mock Exam',`${state.fileName} · ${state.exam.questions.length} questions`);let y=97; y=addWrapped(doc,'Instructions: Choose the best answer for each question. All questions are based on the uploaded PDF.',40,y,510,10)+20;state.exam.questions.forEach((q,i)=>{y=newPageIfNeeded(doc,y);doc.setFontSize(11);doc.setTextColor(23,33,43);doc.text(`${i+1}. ${q.prompt}`,40,y,{maxWidth:510});y+=34;q.options.forEach((o,j)=>{y=addWrapped(doc,`${String.fromCharCode(65+j)}. ${o}`,55,y,480,10)+5;});y+=10;});y=newPageIfNeeded(doc,y+15);doc.setFontSize(15);doc.text('ANSWER SHEET',40,y);y+=25;for(let i=0;i<state.exam.questions.length;i++){doc.setFontSize(10);doc.text(`${i+1}.  ________`,45+(i%4)*125,y+Math.floor(i/4)*22);}footerPages(doc);doc.save(`${state.fileName.replace(/\.pdf$/i,'')}-mock-exam.pdf`);}
function downloadKey(){if(!state.exam?.questions?.length){toast('Create a mock exam before downloading the answer key.');return;}const doc=getPDF();if(!doc)return;addHeader(doc,'Answer Key',`${state.fileName} · ${state.exam.questions.length} questions`);let y=105;state.exam.questions.forEach((q,i)=>{y=newPageIfNeeded(doc,y);doc.setFontSize(11);doc.text(`${i+1}. ${String.fromCharCode(65+q.answerIndex)} — ${q.answer}`,45,y);y+=19;});footerPages(doc);doc.save(`${state.fileName.replace(/\.pdf$/i,'')}-answer-key.pdf`);}

function saveSnapshot(){localStorage.setItem('pdfHubDocument',JSON.stringify({fileName:state.fileName,pages:state.pages,text:state.text,sections:state.sections,questions:state.questions}));}
$('#clearData').addEventListener('click',()=>{if(!confirm('Clear the current document, reviewer progress, and saved result?'))return;localStorage.removeItem('pdfHubDocument');localStorage.removeItem('pdfHubReviewed');localStorage.removeItem('pdfHubLastResult');state.lastResult=null;state.reviewed={};resetDocument();renderResults();toast('Local study data cleared.');});
(function restore(){try{const saved=JSON.parse(localStorage.getItem('pdfHubDocument')||'null');if(saved?.text){state.fileName=saved.fileName;state.pages=saved.pages;state.text=saved.text;state.sections=saved.sections;state.questions=saved.questions;$('#documentTitle').textContent=state.fileName;$('#reviewerSubtitle').textContent=`${state.fileName} · ${state.sections.length} organized sections`;$('#pageCount').textContent=state.pages;$('#wordCount').textContent=state.text.split(/\s+/).length.toLocaleString();$('#topicCount').textContent=state.sections.length;$('#startReview').disabled=false;$('#generateExam').disabled=false;$('#analyzeButton').disabled=true;$('#dashboardStatus').textContent='Restored from this browser.';renderReviewer();updateAvailability();}}catch(e){console.warn('Could not restore local data',e);}})();
