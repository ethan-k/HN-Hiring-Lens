// Sidepanel script for managing saved jobs

let savedJobs = {};

// Load saved jobs from storage
async function loadSavedJobs() {
  return new Promise(resolve => {
    chrome.storage.sync.get(['savedJobs'], (obj) => {
      if (obj['savedJobs']) {
        savedJobs = obj['savedJobs'];
      }
      updateCount();
      renderList();
      resolve();
    });
  });
}

// Save to storage
function saveSavedJobs() {
  chrome.storage.sync.set({ 'savedJobs': savedJobs });
}

// Update count display
function updateCount() {
  const allJobs = Object.keys(savedJobs).length;

  document.getElementById('count').textContent = allJobs;
}

// Truncate text
function truncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + '...';
}

// Render saved jobs list
function renderList() {
  const savedListEl = document.getElementById('saved-list');
  const appliedListEl = document.getElementById('applied-list');

  if (!savedListEl || !appliedListEl) {
    console.error('Could not find list elements');
    return;
  }

  const allJobs = Object.values(savedJobs).sort((a, b) =>
    new Date(b.savedAt) - new Date(a.savedAt)
  );

  const unappliedJobs = allJobs.filter(j => j.applied !== true);
  const appliedJobsList = allJobs.filter(j => j.applied === true);

  // Render saved (unapplied) jobs tab
  if (unappliedJobs.length === 0) {
    savedListEl.innerHTML = '<div class="empty">No saved jobs yet<br><br>Click the ★ button on any HN job comment to save it here.</div>';
  } else {
    savedListEl.innerHTML = unappliedJobs.map(job => renderJobItem(job)).join('');
  }

  // Render applied jobs tab
  if (appliedJobsList.length === 0) {
    appliedListEl.innerHTML = '<div class="empty">No applied jobs yet<br><br>Mark jobs as applied using the checkbox.</div>';
  } else {
    appliedListEl.innerHTML = appliedJobsList.map(job => renderJobItem(job)).join('');
  }

  // Wire up event listeners
  wireEventListeners();
}

// Render a single job item
function renderJobItem(job) {
  return `
    <div class="saved-item ${job.applied ? 'applied' : ''}" data-id="${job.id}">
      <div class="saved-header">
        <strong>${job.author}</strong>
        <span class="saved-age">${job.age}</span>
      </div>
      <div class="saved-body">${truncate(job.body, 200)}</div>
      <div class="saved-actions">
        <label class="applied-checkbox">
          <input type="checkbox" class="applied-check" data-id="${job.id}" ${job.applied ? 'checked' : ''} />
          Applied
        </label>
        <a href="${job.url}" target="_blank">View</a>
        <button class="remove-btn" data-id="${job.id}">Remove</button>
      </div>
    </div>
  `;
}

// Wire up event listeners for dynamically created elements
function wireEventListeners() {
  // Remove buttons
  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      delete savedJobs[id];
      saveSavedJobs();
      updateCount();
      renderList();
    });
  });

  // Applied checkboxes
  document.querySelectorAll('.applied-check').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const id = checkbox.getAttribute('data-id');
      if (savedJobs[id]) {
        savedJobs[id].applied = e.target.checked;
        saveSavedJobs();
        // Add small delay to prevent race condition
        setTimeout(() => {
          updateCount();
          renderList();
        }, 50);
      }
    });
  });
}

// Export to CSV
function exportCSV() {
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
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `hn_saved_jobs_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  alert(`Exported ${jobs.length} saved jobs to CSV`);
}

// Clear all saved jobs
function clearAll() {
  if (confirm('Are you sure you want to remove all saved jobs?')) {
    savedJobs = {};
    saveSavedJobs();
    updateCount();
    renderList();
  }
}

// Tab switching
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `${tabName}-list`);
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSavedJobs();

  // Wire up action buttons
  document.getElementById('export-saved').addEventListener('click', exportCSV);
  document.getElementById('clear-saved').addEventListener('click', clearAll);

  // Wire up tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.getAttribute('data-tab'));
    });
  });

  // Listen for storage changes (when jobs are saved from content script)
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.savedJobs) {
      savedJobs = changes.savedJobs.newValue || {};
      updateCount();
      renderList();
    }
  });
});
