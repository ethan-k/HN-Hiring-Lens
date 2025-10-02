// HN Thread Filter - Content Script
// Filter and highlight comments inline on HN threads

// --- tiny utils ---
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
const storyId = new URL(location.href).searchParams.get("id") || "unknown";

const DEFAULT_PREFS = {
  qInclude: "", qExclude: "",
  remote: false, onsite: false, salary: false,
  topLevelOnly: false,
  hideUSOnly: false,
  stacks: [],
  employmentTypes: [],
  seniorities: [],
  roleTypes: []
};
let prefs = {...DEFAULT_PREFS};
let savedJobs = {}; // Format: { [commentId]: { id, author, age, body, savedAt } }

// --- mount UI ---
function injectBar() {
  if ($('#hnf-bar')) return;
  
  const top = document.createElement('div');
  top.id = 'hnf-bar';
  top.innerHTML = `
    <div class="hnf-row">
      <input id="hnf-include" placeholder="include: comma,separated" title="Include keywords (comma-separated). All must match." />
      <input id="hnf-exclude" placeholder="exclude: comma,separated" title="Exclude keywords (comma-separated). Any match hides a comment." />
    </div>
    <div class="hnf-row">
      <label><input type="checkbox" id="hnf-remote"/>Remote</label>
      <label><input type="checkbox" id="hnf-onsite"/>Onsite/Hybrid</label>
      <label><input type="checkbox" id="hnf-salary"/>Has salary</label>
      <label><input type="checkbox" id="hnf-toplevel"/>Top-level only</label>
      <label><input type="checkbox" id="hnf-hide-us-only"/>Hide US-only</label>
    </div>
    <div class="hnf-row">
      <div class="hnf-filter-group">
        <strong>Employment:</strong>
        <label><input type="checkbox" class="hnf-employment" value="fulltime"/>Full-time</label>
        <label><input type="checkbox" class="hnf-employment" value="parttime"/>Part-time</label>
        <label><input type="checkbox" class="hnf-employment" value="contract"/>Contract</label>
        <label><input type="checkbox" class="hnf-employment" value="intern"/>Intern</label>
      </div>
    </div>
    <div class="hnf-row">
      <div class="hnf-filter-group">
        <strong>Seniority:</strong>
        <label><input type="checkbox" class="hnf-seniority" value="junior"/>Junior</label>
        <label><input type="checkbox" class="hnf-seniority" value="mid"/>Mid-level</label>
        <label><input type="checkbox" class="hnf-seniority" value="senior"/>Senior</label>
        <label><input type="checkbox" class="hnf-seniority" value="staff"/>Staff/Principal</label>
      </div>
    </div>
    <div class="hnf-row">
      <div class="hnf-filter-group">
        <strong>Role:</strong>
        <label><input type="checkbox" class="hnf-role" value="backend"/>Backend</label>
        <label><input type="checkbox" class="hnf-role" value="frontend"/>Frontend</label>
        <label><input type="checkbox" class="hnf-role" value="fullstack"/>Full-stack</label>
        <label><input type="checkbox" class="hnf-role" value="devops"/>DevOps</label>
        <label><input type="checkbox" class="hnf-role" value="mobile"/>Mobile</label>
        <label><input type="checkbox" class="hnf-role" value="data"/>Data/ML</label>
        <label><input type="checkbox" class="hnf-role" value="security"/>Security</label>
      </div>
    </div>
    <div class="hnf-row">
      <div class="hnf-stacks">
        <strong>Tech Stack:</strong>
        <label><input type="checkbox" class="hnf-stack" value="go"/>Go</label>
        <label><input type="checkbox" class="hnf-stack" value="rust"/>Rust</label>
        <label><input type="checkbox" class="hnf-stack" value="java"/>Java</label>
        <label><input type="checkbox" class="hnf-stack" value="kotlin"/>Kotlin</label>
        <label><input type="checkbox" class="hnf-stack" value="python"/>Python</label>
        <label><input type="checkbox" class="hnf-stack" value="typescript"/>TypeScript</label>
        <label><input type="checkbox" class="hnf-stack" value="react"/>React</label>
        <label><input type="checkbox" class="hnf-stack" value="aws"/>AWS</label>
        <label><input type="checkbox" class="hnf-stack" value="gcp"/>GCP</label>
        <label><input type="checkbox" class="hnf-stack" value="kubernetes"/>Kubernetes</label>
        <label><input type="checkbox" class="hnf-stack" value="postgres"/>Postgres</label>
        <label><input type="checkbox" class="hnf-stack" value="kafka"/>Kafka</label>
      </div>
    </div>
    <div class="hnf-row">
      <button id="hnf-clear">Clear</button>
      <button id="hnf-check-applied">Check Applied</button>
      <button id="hnf-copy-emails">Copy Emails</button>
      <button id="hnf-export-csv">Export CSV</button>
      <button id="hnf-toggle-sidebar">Saved Jobs (<span id="hnf-saved-count">0</span>)</button>
      <span id="hnf-count"></span>
    </div>
  `;

  // Create sidebar for saved jobs
  const sidebar = document.createElement('div');
  sidebar.id = 'hnf-sidebar';
  sidebar.innerHTML = `
    <div class="hnf-sidebar-header">
      <h3>Saved Jobs</h3>
      <button id="hnf-close-sidebar">×</button>
    </div>
    <div class="hnf-sidebar-actions">
      <button id="hnf-export-saved">Export Saved</button>
      <button id="hnf-clear-saved">Clear All</button>
    </div>
    <div id="hnf-saved-list"></div>
  `;
  document.body.appendChild(sidebar);
  
  // Place the bar directly after the story header table (fatitem)
  // and inside the same container cell so it spans the main column.
  const fat = document.querySelector('table.fatitem');
  if (fat && fat.parentElement) {
    fat.parentElement.insertBefore(top, fat.nextSibling);
  } else {
    // Fallback: append to the main container cell
    const mainCell = document.querySelector('#hnmain td');
    if (mainCell) mainCell.insertBefore(top, mainCell.firstChild);
    else document.body.prepend(top);
  }
  
  wireEvents();
}

function wireEvents() {
  const bind = (id, type='input') =>
    $(id).addEventListener(type, debounce(applyFilters, 120));

  bind('#hnf-include');
  bind('#hnf-exclude');
  bind('#hnf-remote','change');
  bind('#hnf-onsite','change');
  bind('#hnf-salary','change');
  bind('#hnf-toplevel','change');
  bind('#hnf-hide-us-only','change');

  // Stack checkboxes
  $$('.hnf-stack').forEach(checkbox => {
    checkbox.addEventListener('change', debounce(applyFilters, 120));
  });

  // Employment type checkboxes
  $$('.hnf-employment').forEach(checkbox => {
    checkbox.addEventListener('change', debounce(applyFilters, 120));
  });

  // Seniority checkboxes
  $$('.hnf-seniority').forEach(checkbox => {
    checkbox.addEventListener('change', debounce(applyFilters, 120));
  });

  // Role type checkboxes
  $$('.hnf-role').forEach(checkbox => {
    checkbox.addEventListener('change', debounce(applyFilters, 120));
  });

  $('#hnf-clear').addEventListener('click', () => {
    prefs = {...DEFAULT_PREFS}; 
    save(); 
    restoreUI(); 
    applyFilters();
  });

  $('#hnf-check-applied').addEventListener('click', checkApplied);
  $('#hnf-copy-emails').addEventListener('click', copyEmails);
  $('#hnf-export-csv').addEventListener('click', exportCSV);
  $('#hnf-toggle-sidebar').addEventListener('click', toggleSidebar);
  $('#hnf-close-sidebar').addEventListener('click', closeSidebar);
  $('#hnf-export-saved').addEventListener('click', exportSavedJobs);
  $('#hnf-clear-saved').addEventListener('click', clearSavedJobs);

  // keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Only trigger if not in an input field
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === '/') {
      e.preventDefault();
      $('#hnf-include').focus();
    }
    if (e.key === 'r') $('#hnf-remote').click();
    if (e.key === 't') $('#hnf-toplevel').click();
    if (e.key === 'x') $('#hnf-clear').click();
  });
}

function restoreUI() {
  $('#hnf-include').value = prefs.qInclude;
  $('#hnf-exclude').value = prefs.qExclude;
  $('#hnf-remote').checked = prefs.remote;
  $('#hnf-onsite').checked = prefs.onsite;
  $('#hnf-salary').checked = prefs.salary;
  $('#hnf-toplevel').checked = prefs.topLevelOnly;
  $('#hnf-hide-us-only').checked = prefs.hideUSOnly;

  // Restore stack selections
  $$('.hnf-stack').forEach(checkbox => {
    checkbox.checked = prefs.stacks.includes(checkbox.value);
  });

  // Restore employment type selections
  $$('.hnf-employment').forEach(checkbox => {
    checkbox.checked = prefs.employmentTypes.includes(checkbox.value);
  });

  // Restore seniority selections
  $$('.hnf-seniority').forEach(checkbox => {
    checkbox.checked = prefs.seniorities.includes(checkbox.value);
  });

  // Restore role type selections
  $$('.hnf-role').forEach(checkbox => {
    checkbox.checked = prefs.roleTypes.includes(checkbox.value);
  });
}

const RE = {
  remote: /\b(remote|distributed|anywhere|US hours|EU time.?zone)\b/i,
  onsite: /\b(onsite|on-site|hybrid)\b/i,
  salary: /([$€£]\s?\d{2,3}k|\b\d{2,3}k\b|\b(comp|salary|pay|ote)\b)/i,
  tz: /\bUTC ?[+-]?\d{1,2}\b|\b(ET|PT|CET|CEST|IST|BST|GMT|PST|EST|KST|JST)\b/i,
  usOnly: /\b(US.only|USA.only|US.based.only|United States.only|U\.?S\.?\s+only|US.citizens?.only|US.?.work.authorization|must.be.in.the.US|must.be.based.in.the.US|US.?.location.required|US.?.residency.required|US.Remote|USA.Remote|Remote.US|Remote.USA|Remote.\(US|Remote.\(USA)\b/i,
  stacks: {
    go: /\b(go|golang)\b/i,
    rust: /\brust\b/i,
    java: /\bjava\b/i,
    kotlin: /\bkotlin\b/i,
    python: /\bpython\b/i,
    typescript: /\b(typescript|ts)\b/i,
    react: /\breact\b/i,
    aws: /\baws\b/i,
    gcp: /\b(gcp|google cloud)\b/i,
    kubernetes: /\b(kubernetes|k8s)\b/i,
    postgres: /\b(postgres|postgresql)\b/i,
    kafka: /\bkafka\b/i
  },
  employmentTypes: {
    fulltime: /\b(FT|full.?time|full.time)\b/i,
    parttime: /\b(PT|part.?time|part.time)\b/i,
    contract: /\b(contract|contractor|consulting|freelance)\b/i,
    intern: /\b(intern|internship)\b/i
  },
  seniorities: {
    senior: /\b(senior|sr\.?|lead)\b/i,
    staff: /\b(staff|principal|architect)\b/i,
    mid: /\b(mid.level|intermediate)\b/i,
    junior: /\b(junior|jr\.?|entry.level)\b/i
  },
  roleTypes: {
    backend: /\b(backend|back.end|BE|server.side)\b/i,
    frontend: /\b(frontend|front.end|FE|client.side)\b/i,
    fullstack: /\b(fullstack|full.stack|full stack)\b/i,
    devops: /\b(devops|sre|platform|infrastructure)\b/i,
    mobile: /\b(mobile|ios|android|react.native)\b/i,
    data: /\b(data engineer|data scientist|ML|machine learning|AI)\b/i,
    security: /\b(security|infosec|appsec)\b/i
  }
};

// --- index comments from DOM ---
function getRows() {
  // Prefer explicit class, fallback via body span
  const rows = $$('tr.comtr');
  if (rows.length) return rows;
  return $$('span.commtext').map(s => s.closest('tr')).filter(Boolean);
}

function getIndent(row) {
  // HN stores indent level in the indent attribute on td.ind
  const indentCell = row?.querySelector('td.ind');
  const indentAttr = indentCell ? parseInt(indentCell.getAttribute('indent'), 10) : 0;
  return Number.isFinite(indentAttr) ? indentAttr : 0;
}

function getTopLevel(row) {
  return getIndent(row) === 0;
}

function commentObj(row) {
  // HN uses both span.commtext and div.commtext for comment bodies
  const bodyEl = $('span.commtext', row) || $('.commtext', row);
  const body = bodyEl?.innerText || '';
  const author = $('a.hnuser', row)?.innerText || '';
  const age = $('span.age a', row)?.innerText || '';
  const id = row.getAttribute('id') || '';
  const text = body.toLowerCase();

  return {
    row, id, author, age, body, bodyEl, text,
    indent: getIndent(row),
    flags: {
      remote: RE.remote.test(body),
      onsite: RE.onsite.test(body),
      salary: RE.salary.test(body),
      usOnly: RE.usOnly.test(body),
      stacks: Object.keys(RE.stacks).filter(stack => RE.stacks[stack].test(body)),
      employmentTypes: Object.keys(RE.employmentTypes).filter(type => RE.employmentTypes[type].test(body)),
      seniorities: Object.keys(RE.seniorities).filter(level => RE.seniorities[level].test(body)),
      roleTypes: Object.keys(RE.roleTypes).filter(role => RE.roleTypes[role].test(body))
    }
  };
}

let COMMENTS = [];

function buildIndex() {
  COMMENTS = getRows().map(commentObj);
  // annotate each comment with its top-level ancestor id
  let currentTopId = null;
  for (const c of COMMENTS) {
    if (getTopLevel(c.row)) currentTopId = c.id;
    c.topId = currentTopId;
  }

  // Add save buttons to top-level comments
  COMMENTS.filter(c => getTopLevel(c.row)).forEach(c => {
    if (!c.row.querySelector('.hnf-save-btn')) {
      const saveBtn = document.createElement('button');
      saveBtn.className = 'hnf-save-btn';
      saveBtn.textContent = savedJobs[c.id] ? '★' : '☆';
      saveBtn.title = savedJobs[c.id] ? 'Unsave job' : 'Save job';
      saveBtn.addEventListener('click', () => toggleSaveJob(c));

      // Insert after the comment header (age/link area)
      const ageCell = c.row.querySelector('span.age');
      if (ageCell && ageCell.parentElement) {
        ageCell.parentElement.appendChild(saveBtn);
      }
    }
  });
}

// --- filtering ---
function parseList(s) {
  return (s || '').split(',').map(t => t.trim()).filter(Boolean);
}

function matchTopLevel(c) {
  // Only evaluate filters on top-level comments
  const inc = parseList($('#hnf-include').value.toLowerCase());
  const exc = parseList($('#hnf-exclude').value.toLowerCase());
  const selectedStacks = $$('.hnf-stack:checked').map(cb => cb.value);
  const selectedEmployment = $$('.hnf-employment:checked').map(cb => cb.value);
  const selectedSeniorities = $$('.hnf-seniority:checked').map(cb => cb.value);
  const selectedRoles = $$('.hnf-role:checked').map(cb => cb.value);

  if ($('#hnf-remote').checked && !c.flags.remote) return false;
  if ($('#hnf-onsite').checked && !c.flags.onsite) return false;
  if ($('#hnf-salary').checked && !c.flags.salary) return false;
  if ($('#hnf-hide-us-only').checked && c.flags.usOnly) return false;

  // Stack filtering - if any stacks are selected, comment must match at least one
  if (selectedStacks.length > 0) {
    const hasMatchingStack = selectedStacks.some(stack => c.flags.stacks.includes(stack));
    if (!hasMatchingStack) return false;
  }

  // Employment type filtering - if any types selected, comment must match at least one
  if (selectedEmployment.length > 0) {
    const hasMatchingEmployment = selectedEmployment.some(type => c.flags.employmentTypes.includes(type));
    if (!hasMatchingEmployment) return false;
  }

  // Seniority filtering - if any levels selected, comment must match at least one
  if (selectedSeniorities.length > 0) {
    const hasMatchingSeniority = selectedSeniorities.some(level => c.flags.seniorities.includes(level));
    if (!hasMatchingSeniority) return false;
  }

  // Role type filtering - if any roles selected, comment must match at least one
  if (selectedRoles.length > 0) {
    const hasMatchingRole = selectedRoles.some(role => c.flags.roleTypes.includes(role));
    if (!hasMatchingRole) return false;
  }

  if (inc.length && !inc.every(k => c.text.includes(k))) return false;
  if (exc.length && exc.some(k => c.text.includes(k))) return false;

  return true;
}

function highlightMatches(c) {
  if (!c.bodyEl) return;
  
  // Remove existing highlights
  const highlighted = c.bodyEl.querySelectorAll('.hnf-highlight');
  highlighted.forEach(el => {
    el.outerHTML = el.innerHTML;
  });

  const inc = parseList($('#hnf-include').value);
  if (inc.length === 0) return;

  let html = c.bodyEl.innerHTML;
  
  inc.forEach(term => {
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    html = html.replace(regex, '<span class="hnf-highlight">$1</span>');
  });

  c.bodyEl.innerHTML = html;
}

function applyFilters() {
  // persist prefs
  prefs = {
    qInclude: $('#hnf-include').value,
    qExclude: $('#hnf-exclude').value,
    remote: $('#hnf-remote').checked,
    onsite: $('#hnf-onsite').checked,
    salary: $('#hnf-salary').checked,
    topLevelOnly: $('#hnf-toplevel').checked,
    hideUSOnly: $('#hnf-hide-us-only').checked,
    stacks: $$('.hnf-stack:checked').map(cb => cb.value),
    employmentTypes: $$('.hnf-employment:checked').map(cb => cb.value),
    seniorities: $$('.hnf-seniority:checked').map(cb => cb.value),
    roleTypes: $$('.hnf-role:checked').map(cb => cb.value)
  };
  save();

  // compute visible top-level ids only
  const visibleTop = new Set();
  const topLevelComments = COMMENTS.filter(c => getTopLevel(c.row));
  for (const c of topLevelComments) {
    if (matchTopLevel(c)) visibleTop.add(c.id);
  }

  const topOnly = $('#hnf-toplevel').checked;

  for (const c of COMMENTS) {
    let show;
    const isTop = getTopLevel(c.row);
    if (isTop) {
      show = visibleTop.has(c.id);
      if (show) highlightMatches(c);
    } else {
      // For replies: show if parent is visible, unless top-level only is checked
      const parentVisible = visibleTop.has(c.topId);
      show = parentVisible && !topOnly;
    }
    c.row.classList.toggle('hnf-hide', !show);
  }

  $('#hnf-count').textContent = `${visibleTop.size}/${topLevelComments.length} match`;
}

function save() {
  if (chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.set({ ['prefs:'+storyId]: prefs });
  }
}

function load() {
  return new Promise(resolve => {
    if (chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(['prefs:'+storyId], (obj) => {
        if (obj['prefs:'+storyId]) {
          prefs = {...prefs, ...obj['prefs:'+storyId]};
        }
        resolve();
      });
    } else {
      resolve();
    }
  });
}

function saveSavedJobs() {
  if (chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.set({ 'savedJobs': savedJobs });
  }
}

function loadSavedJobs() {
  return new Promise(resolve => {
    if (chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(['savedJobs'], (obj) => {
        if (obj['savedJobs']) {
          savedJobs = obj['savedJobs'];
        }
        updateSavedCount();
        resolve();
      });
    } else {
      resolve();
    }
  });
}

function debounce(fn, ms) { 
  let t; 
  return (...a) => { 
    clearTimeout(t); 
    t = setTimeout(() => fn(...a), ms); 
  }; 
}

// --- Email extraction ---
function copyEmails() {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const visibleComments = COMMENTS.filter(c => !c.row.classList.contains('hnf-hide'));
  const emails = new Set();
  
  visibleComments.forEach(c => {
    const matches = c.body.match(emailRegex);
    if (matches) {
      matches.forEach(email => emails.add(email));
    }
  });
  
  const emailList = Array.from(emails).join('\n');
  
  if (emails.size === 0) {
    alert('No emails found in visible comments');
    return;
  }
  
  navigator.clipboard.writeText(emailList).then(() => {
    alert(`Copied ${emails.size} unique emails to clipboard`);
  }).catch(() => {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = emailList;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    alert(`Copied ${emails.size} unique emails to clipboard`);
  });
}

// --- CSV Export ---
function exportCSV() {
  const visibleComments = COMMENTS.filter(c => !c.row.classList.contains('hnf-hide'));

  if (visibleComments.length === 0) {
    alert('No visible comments to export');
    return;
  }

  const headers = ['ID', 'Author', 'Age', 'Remote', 'Onsite', 'Salary', 'US-Only', 'Employment', 'Seniority', 'Role', 'Stacks', 'Comment'];
  const rows = [headers];

  visibleComments.forEach(c => {
    rows.push([
      c.id,
      c.author,
      c.age,
      c.flags.remote ? 'Yes' : 'No',
      c.flags.onsite ? 'Yes' : 'No',
      c.flags.salary ? 'Yes' : 'No',
      c.flags.usOnly ? 'Yes' : 'No',
      c.flags.employmentTypes.join(';'),
      c.flags.seniorities.join(';'),
      c.flags.roleTypes.join(';'),
      c.flags.stacks.join(';'),
      '"' + c.body.replace(/"/g, '""') + '"' // Escape quotes in CSV
    ]);
  });

  const csvContent = rows.map(row => row.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `hn_thread_${storyId}_filtered.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    alert(`Exported ${visibleComments.length} comments to CSV`);
  }
}

// --- Check Applied Filters ---
function checkApplied() {
  const activeFilters = [];

  // Check text filters
  const includeText = $('#hnf-include').value.trim();
  const excludeText = $('#hnf-exclude').value.trim();

  if (includeText) {
    activeFilters.push(`Include: "${includeText}"`);
  }

  if (excludeText) {
    activeFilters.push(`Exclude: "${excludeText}"`);
  }

  // Check checkbox filters
  if ($('#hnf-remote').checked) activeFilters.push('Remote jobs only');
  if ($('#hnf-onsite').checked) activeFilters.push('Onsite/Hybrid jobs only');
  if ($('#hnf-salary').checked) activeFilters.push('Jobs with salary info');
  if ($('#hnf-toplevel').checked) activeFilters.push('Top-level comments only');
  if ($('#hnf-hide-us-only').checked) activeFilters.push('Hide US-only jobs');

  // Check employment type filters
  const selectedEmployment = $$('.hnf-employment:checked').map(cb => cb.value);
  if (selectedEmployment.length > 0) {
    activeFilters.push(`Employment types: ${selectedEmployment.join(', ')}`);
  }

  // Check seniority filters
  const selectedSeniorities = $$('.hnf-seniority:checked').map(cb => cb.value);
  if (selectedSeniorities.length > 0) {
    activeFilters.push(`Seniority levels: ${selectedSeniorities.join(', ')}`);
  }

  // Check role type filters
  const selectedRoles = $$('.hnf-role:checked').map(cb => cb.value);
  if (selectedRoles.length > 0) {
    activeFilters.push(`Role types: ${selectedRoles.join(', ')}`);
  }

  // Check tech stack filters
  const selectedStacks = $$('.hnf-stack:checked').map(cb => cb.value);
  if (selectedStacks.length > 0) {
    activeFilters.push(`Tech stacks: ${selectedStacks.join(', ')}`);
  }

  // Display results
  if (activeFilters.length === 0) {
    alert('No filters are currently active.\nShowing all comments.');
  } else {
    const message = `Active filters:\n\n${activeFilters.map((filter, i) => `${i + 1}. ${filter}`).join('\n')}`;
    alert(message);
  }
}

// --- Saved Jobs Functions ---
function toggleSaveJob(comment) {
  if (savedJobs[comment.id]) {
    delete savedJobs[comment.id];
  } else {
    savedJobs[comment.id] = {
      id: comment.id,
      author: comment.author,
      age: comment.age,
      body: comment.body,
      savedAt: new Date().toISOString(),
      url: `https://news.ycombinator.com/item?id=${comment.id}`,
      applied: false
    };
  }
  saveSavedJobs();
  updateSavedCount();
  updateSaveButtons();
  renderSavedList();
}

function updateSaveButtons() {
  COMMENTS.filter(c => getTopLevel(c.row)).forEach(c => {
    const btn = c.row.querySelector('.hnf-save-btn');
    if (btn) {
      btn.textContent = savedJobs[c.id] ? '★' : '☆';
      btn.title = savedJobs[c.id] ? 'Unsave job' : 'Save job';
    }
  });
}

function updateSavedCount() {
  const count = Object.keys(savedJobs).length;
  const countEl = $('#hnf-saved-count');
  if (countEl) countEl.textContent = count;
}

function toggleSidebar() {
  const sidebar = $('#hnf-sidebar');
  sidebar.classList.toggle('hnf-sidebar-open');
  renderSavedList();
}

function closeSidebar() {
  $('#hnf-sidebar').classList.remove('hnf-sidebar-open');
}

function renderSavedList() {
  const listEl = $('#hnf-saved-list');
  if (!listEl) return;

  const jobs = Object.values(savedJobs).sort((a, b) =>
    new Date(b.savedAt) - new Date(a.savedAt)
  );

  if (jobs.length === 0) {
    listEl.innerHTML = '<div class="hnf-empty">No saved jobs yet</div>';
    return;
  }

  listEl.innerHTML = jobs.map(job => `
    <div class="hnf-saved-item ${job.applied ? 'hnf-applied' : ''}" data-id="${job.id}">
      <div class="hnf-saved-header">
        <strong>${job.author}</strong>
        <span class="hnf-saved-age">${job.age}</span>
      </div>
      <div class="hnf-saved-body">${truncate(job.body, 200)}</div>
      <div class="hnf-saved-actions">
        <label class="hnf-applied-checkbox">
          <input type="checkbox" class="hnf-applied-check" data-id="${job.id}" ${job.applied ? 'checked' : ''} />
          Applied
        </label>
        <a href="${job.url}" target="_blank">View</a>
        <button class="hnf-unsave-btn" data-id="${job.id}">Remove</button>
      </div>
    </div>
  `).join('');

  // Wire up remove buttons
  $$('.hnf-unsave-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      delete savedJobs[id];
      saveSavedJobs();
      updateSavedCount();
      updateSaveButtons();
      renderSavedList();
    });
  });

  // Wire up applied checkboxes
  $$('.hnf-applied-check').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const id = checkbox.getAttribute('data-id');
      if (savedJobs[id]) {
        savedJobs[id].applied = e.target.checked;
        saveSavedJobs();
        renderSavedList();
      }
    });
  });
}

function truncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + '...';
}

function exportSavedJobs() {
  const jobs = Object.values(savedJobs);
  if (jobs.length === 0) {
    alert('No saved jobs to export');
    return;
  }

  const headers = ['ID', 'Author', 'Age', 'Applied', 'Saved At', 'URL', 'Comment'];
  const rows = [headers];

  jobs.forEach(job => {
    rows.push([
      job.id,
      job.author,
      job.age,
      job.applied ? 'Yes' : 'No',
      new Date(job.savedAt).toLocaleString(),
      job.url,
      '"' + job.body.replace(/"/g, '""') + '"'
    ]);
  });

  const csvContent = rows.map(row => row.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `hn_saved_jobs_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    alert(`Exported ${jobs.length} saved jobs to CSV`);
  }
}

function clearSavedJobs() {
  if (confirm('Are you sure you want to remove all saved jobs?')) {
    savedJobs = {};
    saveSavedJobs();
    updateSavedCount();
    updateSaveButtons();
    renderSavedList();
  }
}

// --- boot ---
(async function main(){
  // Wait a bit for HN to finish loading
  setTimeout(async () => {
    injectBar();
    await load();
    await loadSavedJobs();
    restoreUI();
    buildIndex();
    applyFilters();
  }, 1000);
})();
// trigger rebuild
