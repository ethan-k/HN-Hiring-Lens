// HN Thread Filter - Content Script
// Filter and highlight comments inline on HN threads

// --- tiny utils ---
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
const storyId = new URL(location.href).searchParams.get("id") || "unknown";

const DEFAULT_PREFS = {
  qInclude: "", qExclude: "",
  remote: false, onsite: false, salary: false,
  topLevelOnly: false, hideReplies: true,
  stacks: []
};
let prefs = {...DEFAULT_PREFS};

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
      <label><input type="checkbox" id="hnf-hidereplies" checked/>Hide replies</label>
    </div>
    <div class="hnf-row">
      <div class="hnf-stacks">
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
      <button id="hnf-copy-emails">Copy Emails</button>
      <button id="hnf-export-csv">Export CSV</button>
      <span id="hnf-count"></span>
    </div>
  `;
  
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
  bind('#hnf-hidereplies','change');

  // Stack checkboxes
  $$('.hnf-stack').forEach(checkbox => {
    checkbox.addEventListener('change', debounce(applyFilters, 120));
  });

  $('#hnf-clear').addEventListener('click', () => {
    prefs = {...DEFAULT_PREFS}; 
    save(); 
    restoreUI(); 
    applyFilters();
  });

  $('#hnf-copy-emails').addEventListener('click', copyEmails);
  $('#hnf-export-csv').addEventListener('click', exportCSV);

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
    if (e.key === 'h') $('#hnf-hidereplies').click();
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
  $('#hnf-hidereplies').checked = prefs.hideReplies;
  
  // Restore stack selections
  $$('.hnf-stack').forEach(checkbox => {
    checkbox.checked = prefs.stacks.includes(checkbox.value);
  });
}

const RE = {
  remote: /\b(remote|distributed|anywhere|US hours|EU time.?zone)\b/i,
  onsite: /\b(onsite|on-site|hybrid)\b/i,
  salary: /([$€£]\s?\d{2,3}k|\b\d{2,3}k\b|\b(comp|salary|pay|ote)\b)/i,
  tz: /\bUTC ?[+-]?\d{1,2}\b|\b(ET|PT|CET|CEST|IST|BST|GMT|PST|EST|KST|JST)\b/i,
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
  // HN uses an indent cell with a spacer image width = depth*40
  const img = row?.querySelector('td.ind img[width]');
  const w = img ? parseInt(img.getAttribute('width'), 10) : 0;
  return Number.isFinite(w) ? w : 0;
}

function getTopLevel(row) {
  return getIndent(row) === 0;
}

function commentObj(row) {
  const bodyEl = $('span.commtext', row);
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
      stacks: Object.keys(RE.stacks).filter(stack => RE.stacks[stack].test(body))
    }
  };
}

let COMMENTS = [];

function buildIndex() {
  COMMENTS = getRows().map(commentObj);
}

// --- filtering ---
function parseList(s) {
  return (s || '').split(',').map(t => t.trim()).filter(Boolean);
}

function matchComment(c) {
  const inc = parseList($('#hnf-include').value.toLowerCase());
  const exc = parseList($('#hnf-exclude').value.toLowerCase());
  const selectedStacks = $$('.hnf-stack:checked').map(cb => cb.value);

  if ($('#hnf-remote').checked && !c.flags.remote) return false;
  if ($('#hnf-onsite').checked && !c.flags.onsite) return false;
  if ($('#hnf-salary').checked && !c.flags.salary) return false;
  if ($('#hnf-toplevel').checked && !getTopLevel(c.row)) return false;

  // Stack filtering - if any stacks are selected, comment must match at least one
  if (selectedStacks.length > 0) {
    const hasMatchingStack = selectedStacks.some(stack => c.flags.stacks.includes(stack));
    if (!hasMatchingStack) return false;
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
    hideReplies: $('#hnf-hidereplies').checked,
    stacks: $$('.hnf-stack:checked').map(cb => cb.value)
  };
  save();

  // compute visible ids
  const visible = new Set();
  for (const c of COMMENTS) {
    if (matchComment(c)) {
      visible.add(c.row.id);
    }
  }

  // show/hide with subtree handling
  const hideReplies = $('#hnf-hidereplies').checked;
  let hiddenSubtreeIndent = -1; // width of the ancestor whose subtree is hidden
  for (const c of COMMENTS) {
    let show = visible.has(c.row.id);
    const indent = c.indent ?? getIndent(c.row);

    if (hideReplies) {
      // If we're inside a hidden subtree, force-hide until we climb back
      if (hiddenSubtreeIndent >= 0) {
        if (indent > hiddenSubtreeIndent) {
          show = false;
        } else {
          // exited the hidden subtree
          hiddenSubtreeIndent = -1;
        }
      }
      // Start hiding subtree from a hidden node
      if (hiddenSubtreeIndent < 0 && !show) {
        hiddenSubtreeIndent = indent;
      }
    }

    c.row.classList.toggle('hnf-hide', !show);

    if (show) highlightMatches(c);
  }

  $('#hnf-count').textContent = `${visible.size}/${COMMENTS.length} match`;
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
  
  const headers = ['ID', 'Author', 'Age', 'Remote', 'Onsite', 'Salary', 'Stacks', 'Comment'];
  const rows = [headers];
  
  visibleComments.forEach(c => {
    rows.push([
      c.id,
      c.author,
      c.age,
      c.flags.remote ? 'Yes' : 'No',
      c.flags.onsite ? 'Yes' : 'No',
      c.flags.salary ? 'Yes' : 'No',
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

// --- boot ---
(async function main(){
  // Wait a bit for HN to finish loading
  setTimeout(async () => {
    injectBar();
    await load();
    restoreUI();
    buildIndex();
    applyFilters();
  }, 1000);
})();
