    // =========================================================================
    // 1. CORE UTILITIES
    // =========================================================================
    const Utils = {
      formatCurrency(value) {
        const amount = Number(value) || 0;
        return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
      },
      formatSigned(value) {
        const amount = Number(value) || 0;
        return `${amount >= 0 ? '+' : '-'}${Utils.formatCurrency(Math.abs(amount))}`;
      },
      formatPct(value) {
        const amount = Number(value) || 0;
        return `${amount.toFixed(1)}%`;
      },
      escapeHtml(text) {
        const s = text == null ? '' : String(text);
        return s.replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
      },
      debounce(fn, wait) {
        let timeout;
        return (...args) => {
          clearTimeout(timeout);
          timeout = setTimeout(() => fn(...args), wait);
        };
      },
      currentRangeOpts() {
        return {
          range: AppState.range,
          fromIso: AppState.range === 'custom' ? AppState.fromIso || null : null,
          toIso: AppState.range === 'custom' ? AppState.toIso || null : null
        };
      },
      showLoader(show) {
        const el = document.getElementById('loader');
        if (el) el.classList.toggle('hidden', !show);
      },
      showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
      },
      showFatalError(message) {
        const box = document.getElementById('fatal-error');
        const text = document.getElementById('fatal-error-message');
        if (box && text) {
          text.textContent = message || 'Unknown error';
          box.classList.remove('hidden');
        }
      },
      clearFatalError() {
        const box = document.getElementById('fatal-error');
        if (box) box.classList.add('hidden');
      }
    };

    // =========================================================================
    // 2. API CLIENT (serverCall & api)
    // =========================================================================
    const ApiClient = {
      serverCall(functionName, ...args) {
        return new Promise((resolve, reject) => {
          if (typeof google === 'undefined' || !google.script || !google.script.run) {
            reject(new Error('Dashboard must be opened from the Financial Dashboard web app link.'));
            return;
          }
          google.script.run
            .withSuccessHandler(resolve)
            .withFailureHandler(err => reject(new Error(err?.message || String(err))))
            [functionName](...args);
        });
      },
      async api(functionName, ...args) {
        const res = await this.serverCall(functionName, ...args);
        if (res && res.ok === false) {
          const msg = res.error?.message || res.error?.code || 'Request failed';
          throw new Error(msg);
        }
        return res && res.data !== undefined ? res.data : res;
      }
    };

    // =========================================================================
    // 3. APPLICATION STATE (global, preserved for inline handlers)
    // =========================================================================
    window.AppState = {
      route: 'dashboard',
      range: '30d',
      fromIso: '',
      toIso: '',
      theme: localStorage.getItem('classicTheme') || 'sacred',
      bundle: null,
      chartPack: null,
      transactions: { items: [], total: 0, categories: [], page: 1, pageSize: 25, filters: { search: '', category: 'All', min: '', max: '' } },
      budgets: [],
      budgetChart: null,
      goals: [],
      insights: '',
      settings: {},
      sourceInfo: {},
      diagnostics: null,
      healthReport: null,
      logs: [],
      accounts: [],
      calendar: {
        view: 'month',
        anchorDate: new Date().toISOString().slice(0, 10),
        data: null,
        activeDate: null,
        activeDayData: null
      },
      buildInfo: { version: 'webapp-hardening-v1', loadedAt: new Date().toISOString() },
      showLabs: false,
      systemLoadError: null
    };

    const PageMeta = {
      dashboard: ['Dashboard', 'Unified overview, KPI strip, and the high-value charts.'],
      transactions: ['Transactions', 'Server-backed pagination and fast filtering.'],
      analytics: ['Analytics', 'Playful chart pack adapted to the single-source backend.'],
      budget: ['Budget', 'Budget actuals, editing, and smart suggestions.'],
      goals: ['Goals', 'Track progress targets without leaving the dashboard.'],
      calendar: ['Calendar', 'Month/week cards with server-backed notes and drill-down.'],
      categories: ['Categories', 'Category leaderboard and share of spend.'],
      merchants: ['Merchants', 'Merchant ranking and concentration analysis.'],
      insights: ['Insights', 'Recurring signals, quick actions, and AI summaries.'],
      forecast: ['Forecast', 'Projection view plus net-worth style account editing.'],
      settings: ['Settings', 'Theme and source configuration.'],
      system: ['System', 'Health, diagnostics, and recent logs.'],
      labs: ['Developer', 'Import, cache controls, and backend diagnostics.']
    };

    const ThemeOptions = [
      { id: 'sacred', label: 'Sacred Blue', cls: 'theme-sacred', preview: 'theme-sacred-preview' },
      { id: 'midnight', label: 'Midnight', cls: 'theme-midnight', preview: 'theme-midnight-preview' },
      { id: 'emerald', label: 'Emerald', cls: 'theme-emerald', preview: 'theme-emerald-preview' },
      { id: 'ember', label: 'Ember', cls: 'theme-ember', preview: 'theme-ember-preview' }
    ];

    // =========================================================================