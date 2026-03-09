    // 4. STATE PERSISTENCE & UI HELPERS
    // =========================================================================
    const StateManager = {
      saveUiState() {
        try {
          localStorage.setItem('classicRoute', AppState.route || 'dashboard');
          localStorage.setItem('classicRange', AppState.range || '30d');
          localStorage.setItem('classicFromIso', AppState.fromIso || '');
          localStorage.setItem('classicToIso', AppState.toIso || '');
        } catch (e) {}
      },
      restoreUiState() {
        try {
          AppState.route = localStorage.getItem('classicRoute') || AppState.route;
          AppState.range = localStorage.getItem('classicRange') || AppState.range;
          AppState.fromIso = localStorage.getItem('classicFromIso') || '';
          AppState.toIso = localStorage.getItem('classicToIso') || '';
          const params = new URLSearchParams(window.location.search);
          AppState.showLabs = params.get('labs') === '1' || params.get('dev') === '1' || localStorage.getItem('classicShowLabs') === '1';
          const rangeEl = document.getElementById('range-select');
          if (rangeEl) rangeEl.value = AppState.range;
          const fromEl = document.getElementById('custom-from');
          const toEl = document.getElementById('custom-to');
          if (fromEl && AppState.fromIso) fromEl.value = AppState.fromIso;
          if (toEl && AppState.toIso) toEl.value = AppState.toIso;
          if (AppState.route && AppState.route !== 'dashboard') window.location.hash = AppState.route;
          this.updateLabsNavVisibility();
        } catch (e) {}
      },
      updateLabsNavVisibility() {
        const el = document.getElementById('nav-labs');
        if (el) el.classList.toggle('hidden', !AppState.showLabs);
      },
      applyTheme(themeId) {
        const theme = ThemeOptions.find(t => t.id === themeId) || ThemeOptions[0];
        document.body.className = theme.cls;
        AppState.theme = theme.id;
        localStorage.setItem('classicTheme', theme.id);
        this.renderThemes();
      },
      renderThemes() {
        const target = document.getElementById('theme-swatches');
        if (!target) return;
        target.innerHTML = ThemeOptions.map(theme => `
          <button class="theme-swatch ${theme.preview} ${AppState.theme === theme.id ? 'active' : ''}" data-theme="${theme.id}">
            ${Utils.escapeHtml(theme.label)}
          </button>
        `).join('');
        target.querySelectorAll('[data-theme]').forEach(btn => {
          btn.addEventListener('click', async () => {
            StateManager.applyTheme(btn.dataset.theme);
            await ApiClient.serverCall('saveUserSettings', { ...AppState.settings, theme: AppState.theme, source: document.getElementById('source-type')?.value, externalId: document.getElementById('external-sheet-id')?.value.trim() });
          });
        });
      },
      setPageMeta(route) {
        const meta = PageMeta[route] || PageMeta.dashboard;
        const titleEl = document.getElementById('page-title');
        const subtitleEl = document.getElementById('page-subtitle');
        if (titleEl) titleEl.textContent = meta[0];
        if (subtitleEl) subtitleEl.textContent = meta[1];
      }
    };

    // =========================================================================
    // 5. ROUTER
    // =========================================================================
    window.Router = {
      init() {
        document.querySelectorAll('.nav-link').forEach(btn => {
          btn.addEventListener('click', () => this.go(btn.dataset.route));
        });
        window.addEventListener('hashchange', () => this.render());
        this.render();
      },
      go(route) {
        window.location.hash = route;
        StateManager.saveUiState();
      },
      render() {
        const route = (window.location.hash || '#dashboard').replace('#', '');
        AppState.route = PageMeta[route] ? route : 'dashboard';
        document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.dataset.page === AppState.route));
        document.querySelectorAll('.nav-link').forEach(link => link.classList.toggle('active', link.dataset.route === AppState.route));
        StateManager.setPageMeta(AppState.route);
        ChartRenderer.renderForRoute(AppState.route);
        StateManager.saveUiState();
      }
    };

    // =========================================================================
    // 6. DATA LOADER (populates AppState)
    // =========================================================================
    window.DataLoader = {
      async bootstrap() {
        Utils.showLoader(true);
        try {
          await this.reloadAll();
        } catch (error) {
          Utils.showFatalError(error.message || 'Failed to initialize dashboard.');
        } finally {
          Utils.showLoader(false);
        }
      },

      async reloadAll() {
        await Promise.all([
          this.reloadRangeData(false),
          GoalsModule.load(),
          SettingsModule.load(),
          SystemModule.load(),
          ForecastModule.load()
        ]);
      },

      async reloadRangeData(showLoading = false) {
        if (showLoading) Utils.showLoader(true);
        try {
          if (AppState.range === 'custom') {
            AppState.fromIso = document.getElementById('custom-from')?.value || AppState.fromIso;
            AppState.toIso = document.getElementById('custom-to')?.value || AppState.toIso;
            if (!AppState.fromIso || !AppState.toIso) {
              Utils.showToast('Choose both custom dates first.', 'error');
              return;
            }
          }
          const opts = Utils.currentRangeOpts();
          const [bootstrap, txData, budgets, insights, calendarData] = await Promise.all([
            ApiClient.serverCall('apiGetAppBootstrap', opts),
            ApiClient.serverCall('apiGetTransactionsPage', { ...opts, offset: 0, limit: AppState.transactions.pageSize }),
            ApiClient.serverCall('getBudgetsData', opts),
            ApiClient.serverCall('getAiFinancialInsights'),
            ApiClient.serverCall('getCalendarData', { view: AppState.calendar.view, anchorDate: AppState.calendar.anchorDate })
          ]);
          if (!bootstrap.ok) throw new Error(bootstrap.error?.message || 'Failed to load app bootstrap');
          AppState.bundle = bootstrap.data.dashboard;
          AppState.chartPack = bootstrap.data.charts || {};
          AppState.transactions.page = 1;
          AppState.transactions.items = txData.data?.transactions || [];
          AppState.transactions.total = txData.data?.total || 0;
          AppState.transactions.categories = txData.data?.categories || [];
          AppState.budgets = budgets.data?.budgets || [];
          AppState.budgetChart = budgets.data?.chart || { categories: [], actual: [] };
          AppState.insights = insights.data?.text || '';
          AppState.calendar.data = calendarData.data || null;
          Utils.clearFatalError();
          this.renderRangeBoundViews();
        } finally {
          if (showLoading) Utils.showLoader(false);
        }
      },

      renderRangeBoundViews() {
        renderKpis();
        renderBanner();
        renderDashboardSummary();
        TransactionsModule.render();
        BudgetModule.render();
        CalendarModule.render();
        InsightsModule.render();
        renderCategoryPage();
        renderMerchantPage();
        ChartRenderer.renderForRoute(AppState.route);
      }
    };

    // =========================================================================
    // 7. RENDER FUNCTIONS (for dashboard parts)
    // =========================================================================
    function renderKpis() {
      const kpis = AppState.bundle?.kpis || {};
      document.getElementById('kpi-balance').textContent = Utils.formatCurrency(kpis.currentBalance);
      document.getElementById('kpi-income').textContent = Utils.formatCurrency(kpis.totalIncome);
      document.getElementById('kpi-expenses').textContent = Utils.formatCurrency(kpis.totalExpenses);
      document.getElementById('kpi-savings').textContent = Utils.formatPct(kpis.savingsRate);
      document.getElementById('kpi-burn').textContent = Utils.formatCurrency(kpis.burnRate);
      document.getElementById('kpi-zero').textContent = kpis.projectedDaysToZero == null ? 'Stable' : `${kpis.projectedDaysToZero}d`;
      document.getElementById('kpi-payday').textContent = kpis.daysUntilPayday == null ? '-' : `${kpis.daysUntilPayday}d`;
    }

    function renderBanner() {
      const banner = document.getElementById('validation-banner');
      const meta = AppState.bundle?.meta;
      const warnings = [];
      if (meta?.validation?.errors) warnings.push(...meta.validation.errors);
      if (meta?.validation?.warnings) warnings.push(...meta.validation.warnings);
      if (!warnings.length && meta?.totalRows) {
        banner.classList.add('hidden');
        banner.textContent = '';
        return;
      }
      if (!meta || !meta.totalRows) warnings.push('No transactions were returned for the selected source.');
      banner.innerHTML = warnings.map(w => `<div>${Utils.escapeHtml(w)}</div>`).join('');
      banner.classList.remove('hidden');
    }

    function renderDashboardSummary() {
      const bundle = AppState.bundle || { lists: {}, health: {}, meta: {}, kpis: {} };
      const health = bundle.health || {};
      document.getElementById('health-grade').textContent = health.grade || 'No data';
      document.getElementById('health-message').textContent = health.message || 'Add more data to improve the signal quality.';
      document.getElementById('health-total-rows').textContent = `${bundle.meta.totalRows || 0} rows`;
      document.getElementById('health-range').textContent = bundle.meta.range || AppState.range;
      const signalRows = [
        { title: 'Net cash flow', value: Utils.formatSigned(bundle.kpis.netCashFlow), tone: bundle.kpis.netCashFlow >= 0 ? 'text-income' : 'text-expense' },
        { title: 'Top category', value: bundle.lists.topCategories?.[0] ? `${bundle.lists.topCategories[0].name} · ${Utils.formatCurrency(bundle.lists.topCategories[0].amount)}` : 'No category data', tone: '' },
        { title: 'Top merchant', value: bundle.lists.topMerchants?.[0] ? `${bundle.lists.topMerchants[0].name} · ${Utils.formatCurrency(bundle.lists.topMerchants[0].amount)}` : 'No merchant data', tone: '' }
      ];
      document.getElementById('smart-signals').innerHTML = signalRows.map(row => `
        <div class="signal-card">
          <strong>${Utils.escapeHtml(row.title)}</strong>
          <div class="${row.tone || ''}">${Utils.escapeHtml(row.value)}</div>
        </div>
      `).join('');
      renderRecentList();
      renderRecurringList();
    }

    function renderRecentList() {
      const list = AppState.bundle?.lists?.recentTransactions || [];
      const target = document.getElementById('recent-transactions');
      target.innerHTML = list.slice(0, 8).map(tx => `
        <div class="list-item">
          <div>
            <strong>${Utils.escapeHtml(tx.description || tx.name)}</strong>
            <div class="muted">${Utils.escapeHtml(tx.date)} · ${Utils.escapeHtml(tx.category)}</div>
          </div>
          <div class="${tx.type === 'income' ? 'text-income' : 'text-expense'}">${Utils.formatSigned(tx.amount)}</div>
        </div>
      `).join('') || '<div class="signal-card">No recent transactions.</div>';
    }

    function renderRecurringList() {
      const list = AppState.bundle?.lists?.recurringCandidates || [];
      const target = document.getElementById('recurring-candidates');
      target.innerHTML = list.slice(0, 8).map(item => `
        <div class="list-item">
          <div>
            <strong>${Utils.escapeHtml(item.description || item.name || 'Recurring pattern')}</strong>
            <div class="muted">${Utils.escapeHtml(item.category || 'Recurring')}</div>
          </div>
          <div>${Utils.formatCurrency(item.avgAmount || item.amount || 0)}</div>
        </div>
      `).join('') || '<div class="signal-card">No recurring candidates found in this range.</div>';
    }

    function renderCategoryPage() {
      const list = AppState.bundle?.lists?.topCategories || [];
      document.getElementById('category-leaderboard').innerHTML = list.map((item, index) => `
        <div class="leaderboard-item">
          <div>
            <strong>${index + 1}. ${Utils.escapeHtml(item.name)}</strong>
            <div class="muted">${Utils.formatCurrency(item.amount)}</div>
          </div>
          <div>${Utils.formatPct(((item.amount || 0) / Math.max(1, AppState.bundle?.kpis?.totalExpenses || 1)) * 100)}</div>
        </div>
      `).join('') || '<div class="signal-card">No category spend for this period.</div>';
    }

    function renderMerchantPage() {
      const list = AppState.bundle?.lists?.topMerchants || [];
      document.getElementById('merchant-leaderboard').innerHTML = list.map((item, index) => `
        <div class="leaderboard-item">
          <div>
            <strong>${index + 1}. ${Utils.escapeHtml(item.name)}</strong>
            <div class="muted">${item.transactions || 0} transactions</div>
          </div>
          <div>${Utils.formatCurrency(item.amount)}</div>
        </div>
      `).join('') || '<div class="signal-card">No merchant data for this period.</div>';
    }

    // =========================================================================
    // 8. CHART RENDERER
    // =========================================================================
    window.ChartRenderer = {
      renderForRoute(route) {
        if (!AppState.chartPack || !AppState.bundle) return;
        const renderers = {
          dashboard: this.renderDashboard,
          analytics: this.renderAnalytics,
          categories: this.renderCategories,
          merchants: this.renderMerchants,
          budget: () => BudgetModule.renderChart(),
          forecast: () => ForecastModule.renderChart()
        };
        if (renderers[route]) renderers[route].call(this);
      },

      baseLayout(title) {
        return {
          title: title || '',
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          font: { color: '#d9e5ff' },
          margin: { l: 48, r: 18, t: 22, b: 42 }
        };
      },

      react(id, data, layout) {
        const node = document.getElementById(id);
        if (!node || typeof Plotly === 'undefined') return;
        try {
          Plotly.react(node, data, layout, { displayModeBar: false, responsive: true });
        } catch (err) {
          console.warn('Chart render failed:', id, err);
        }
      },

      renderDashboard() {
        const pack = AppState.chartPack || {};
        const run = pack.runningBalance || [];
        const donut = pack.categoryDonut || [];
        const incExp = pack.incomeVsExpense || [];
        const monthly = pack.monthlyNet || [];
        this.react('chart-running-balance', [{
          x: run.map(r => r.date),
          y: run.map(r => r.balance),
          type: 'scatter', mode: 'lines', fill: 'tozeroy', line: { color: '#79a8ff', width: 3 }
        }], this.baseLayout(''));
        this.react('chart-category-donut', [{
          labels: donut.map(r => r.category),
          values: donut.map(r => r.amount),
          type: 'pie', hole: 0.58,
          marker: { colors: ['#79a8ff','#4dd2ff','#36d399','#fbbf24','#fb7185','#c084fc','#f472b6','#818cf8'] }
        }], this.baseLayout(''));
        this.react('chart-income-expense', [
          { x: incExp.map(r => r.month), y: incExp.map(r => r.income), type: 'scatter', mode: 'lines+markers', name: 'Income', line: { color: '#36d399', width: 3 } },
          { x: incExp.map(r => r.month), y: incExp.map(r => r.expenses), type: 'scatter', mode: 'lines+markers', name: 'Expenses', line: { color: '#fb7185', width: 3 } }
        ], this.baseLayout(''));
        this.react('chart-monthly-net', [{
          x: monthly.map(r => r.month),
          y: monthly.map(r => r.net),
          type: 'bar',
          marker: { color: monthly.map(r => r.net >= 0 ? '#36d399' : '#fb7185') }
        }], this.baseLayout(''));
      },

      renderAnalytics() {
        const pack = AppState.chartPack || {};
        const scatter = pack.scatter || [];
        const hist = pack.histogram || [];
        const wday = pack.weekdayHeatmap || {};
        const catMonth = pack.categoryMonthHeatmap || {};
        const waterfall = pack.monthlyWaterfall || [];
        const surf = pack.surface3D || {};
        const forecast = pack.forecast || {};
        const trends = pack.categoryTrends || {};
        const adv = pack.advancedTrend || [];
        const sankey = pack.sankey || {};

        this.react('chart-scatter', [{
          x: scatter.map(r => r.date),
          y: scatter.map(r => r.amount),
          mode: 'markers', type: 'scatter',
          marker: { color: scatter.map(r => r.amount >= 0 ? '#36d399' : '#fb7185'), size: 9, opacity: 0.8 }
        }], this.baseLayout(''));

        this.react('chart-histogram', [{ x: hist, type: 'histogram', marker: { color: '#79a8ff' } }], this.baseLayout(''));

        this.react('chart-weekday-heatmap', [{
          x: wday.x || [], y: wday.y || [], z: wday.z || [], type: 'heatmap', colorscale: 'Blues'
        }], this.baseLayout(''));

        this.react('chart-category-heatmap', [{
          x: catMonth.x || [], y: catMonth.y || [], z: catMonth.z || [], type: 'heatmap', colorscale: 'YlOrRd'
        }], this.baseLayout(''));

        this.react('chart-waterfall', [{
          x: waterfall.map(r => r.month),
          y: waterfall.map(r => r.net),
          type: 'waterfall',
          connector: { line: { color: '#4dd2ff' } },
          increasing: { marker: { color: '#36d399' } },
          decreasing: { marker: { color: '#fb7185' } }
        }], this.baseLayout(''));

        this.react('chart-surface-3d', [{
          x: surf.x || [], y: surf.y || [], z: surf.z || [], type: 'surface', colorscale: 'Viridis'
        }], { ...this.baseLayout(''), scene: { bgcolor: 'rgba(0,0,0,0)' } });

        this.react('chart-forecast-main', [
          { x: forecast.labels || [], y: forecast.balance || [], type: 'scatter', mode: 'lines+markers', name: 'Balance', line: { color: '#79a8ff', width: 3 } },
          { x: forecast.labels || [], y: forecast.netFlow || [], type: 'bar', name: 'Net flow', marker: { color: '#36d399' } }
        ], this.baseLayout(''));

        this.react('chart-category-trends', (trends.series || []).map(s => ({
          x: trends.months || [], y: s.values || [], type: 'scatter', mode: 'lines+markers', name: s.category, line: { width: 2 }
        })), this.baseLayout(''));

        this.react('chart-advanced-trend', [
          { x: adv.map(r => r.month), y: adv.map(r => r.totalSpending), type: 'scatter', mode: 'lines', name: 'Spending', line: { color: '#fb7185', width: 3 } },
          { x: adv.map(r => r.month), y: adv.map(r => r.totalIncome), type: 'scatter', mode: 'lines', name: 'Income', line: { color: '#36d399', width: 3 } }
        ], this.baseLayout(''));

        this.react('chart-sankey', [{
          type: 'sankey',
          node: { label: sankey.labels || [], pad: 20, thickness: 16, color: '#79a8ff' },
          link: { source: sankey.sources || [], target: sankey.targets || [], value: sankey.values || [], color: sankey.colors || [] }
        }], this.baseLayout(''));
      },

      renderCategories() {
        const list = AppState.bundle?.lists?.topCategories || [];
        this.react('category-page-chart', [{
          x: list.map(i => i.name), y: list.map(i => i.amount), type: 'bar', marker: { color: '#79a8ff' }
        }], this.baseLayout(''));
      },

      renderMerchants() {
        const list = AppState.bundle?.lists?.topMerchants || [];
        const amounts = list.map(i => i.amount).reverse();
        const names = list.map(i => i.name).reverse();
        this.react('merchant-chart', [{
          x: amounts, y: names, type: 'bar', orientation: 'h', marker: { color: '#4dd2ff' }
        }], this.baseLayout(''));
      }
    };

    // =========================================================================
    // 9. PAGE MODULES
    // =========================================================================
    window.TransactionsModule = {
      bind() {
        document.getElementById('tx-filter-btn')?.addEventListener('click', () => this.reload(1));
        document.getElementById('tx-prev')?.addEventListener('click', () => this.reload(AppState.transactions.page - 1));
        document.getElementById('tx-next')?.addEventListener('click', () => this.reload(AppState.transactions.page + 1));
        document.getElementById('tx-search')?.addEventListener('input', Utils.debounce(() => this.reload(1), 250));
      },

      async reload(page = 1) {
        AppState.transactions.filters = {
          search: document.getElementById('tx-search')?.value.trim() || '',
          category: document.getElementById('tx-category')?.value || 'All',
          min: document.getElementById('tx-min')?.value || '',
          max: document.getElementById('tx-max')?.value || ''
        };
        AppState.transactions.page = Math.max(1, page);
        const opts = {
          ...Utils.currentRangeOpts(),
          ...AppState.transactions.filters,
          offset: (AppState.transactions.page - 1) * AppState.transactions.pageSize,
          limit: AppState.transactions.pageSize
        };
        const result = await ApiClient.serverCall('getClassicTransactions', opts);
        AppState.transactions.items = result.data?.transactions || [];
        AppState.transactions.total = result.data?.total || 0;
        AppState.transactions.categories = result.data?.categories || [];
        this.render();
      },

      render() {
        const body = document.getElementById('transactions-body');
        body.innerHTML = AppState.transactions.items.map(tx => `
          <tr>
            <td>${Utils.escapeHtml(tx.dateFormatted || tx.date)}</td>
            <td>${Utils.escapeHtml(tx.description || tx.name)}</td>
            <td>${Utils.escapeHtml(tx.category)}</td>
            <td>${Utils.escapeHtml(tx.type)}</td>
            <td class="${tx.type === 'income' ? 'text-income' : 'text-expense'}">${Utils.formatSigned(tx.amount)}</td>
          </tr>
        `).join('') || '<tr><td colspan="5">No transactions for the current filters.</td></tr>';
        const indicator = document.getElementById('tx-page-indicator');
        const pages = Math.max(1, Math.ceil(AppState.transactions.total / AppState.transactions.pageSize));
        indicator.textContent = `Page ${AppState.transactions.page} of ${pages}`;
        document.getElementById('transactions-summary').textContent = `${AppState.transactions.total} matching transactions`;
        document.getElementById('tx-prev').disabled = AppState.transactions.page <= 1;
        document.getElementById('tx-next').disabled = AppState.transactions.page >= pages;
        const currentCategory = AppState.transactions.filters.category || 'All';
        document.getElementById('tx-category').innerHTML = ['All'].concat(AppState.transactions.categories).map(cat => `
          <option value="${Utils.escapeHtml(cat)}" ${cat === currentCategory ? 'selected' : ''}>${Utils.escapeHtml(cat === 'All' ? 'All categories' : cat)}</option>
        `).join('');
      }
    };

    window.BudgetModule = {
      bind() {
        document.getElementById('budget-suggestions-btn')?.addEventListener('click', () => this.applySuggestions());
        document.getElementById('budget-save-btn')?.addEventListener('click', () => this.save());
      },

      render() {
        const list = document.getElementById('budget-list');
        const actualByCategory = {};
        (AppState.budgetChart.categories || []).forEach((cat, i) => { actualByCategory[cat] = AppState.budgetChart.actual[i] || 0; });
        list.innerHTML = AppState.budgets.map((budget, idx) => {
          const actual = actualByCategory[budget.category] || 0;
          const amount = Number(budget.amount) || 0;
          const pct = amount > 0 ? Math.min(100, (actual / amount) * 100) : 0;
          return `
            <div class="budget-card" data-budget-index="${idx}">
              <div class="budget-top">
                <div>
                  <strong>${Utils.escapeHtml(budget.category)}</strong>
                  <div class="muted">${Utils.escapeHtml(budget.period || 'monthly')}</div>
                </div>
                <input class="control-input budget-input" type="number" value="${amount}">
              </div>
              <div class="progress"><div style="width:${pct}%"></div></div>
              <div class="muted">${Utils.formatCurrency(actual)} spent of ${Utils.formatCurrency(amount)}</div>
            </div>
          `;
        }).join('') || '<div class="signal-card">No budgets saved yet.</div>';
        list.querySelectorAll('.budget-input').forEach((input, idx) => {
          input.addEventListener('change', e => {
            AppState.budgets[idx].amount = Number(e.target.value) || 0;
            this.renderChart();
          });
        });
        this.renderChart();
      },

      renderChart() {
        const budgets = AppState.budgets || [];
        const actualByCategory = {};
        (AppState.budgetChart.categories || []).forEach((cat, i) => { actualByCategory[cat] = AppState.budgetChart.actual[i] || 0; });
        const node = document.getElementById('budget-chart');
        if (!node) return;
        Plotly.react(node, [
          { x: budgets.map(b => b.category), y: budgets.map(b => Number(b.amount) || 0), type: 'bar', name: 'Budget', marker: { color: '#79a8ff' } },
          { x: budgets.map(b => b.category), y: budgets.map(b => actualByCategory[b.category] || 0), type: 'bar', name: 'Actual', marker: { color: '#fb7185' } }
        ], ChartRenderer.baseLayout(''), { displayModeBar: false, responsive: true });
      },

      async applySuggestions() {
        const result = await ApiClient.serverCall('getSmartBudgetSuggestions');
        const suggestions = result.data || [];
        suggestions.forEach(s => {
          const existing = AppState.budgets.find(b => b.category === s.category);
          if (existing && !existing.amount) existing.amount = s.suggestedMonthly;
          if (!existing) AppState.budgets.push({ category: s.category, amount: s.suggestedMonthly, period: 'monthly' });
        });
        this.render();
        Utils.showToast('Applied smart budget suggestions.', 'success');
      },

      async save() {
        const payload = {};
        AppState.budgets.forEach(b => { payload[b.category] = Number(b.amount) || 0; });
        const result = await ApiClient.serverCall('saveFinalBudgets', payload);
        Utils.showToast(result.status === 'success' ? 'Budgets saved.' : (result.message || 'Budget save failed'), result.status === 'success' ? 'success' : 'error');
        await DataLoader.reloadRangeData();
      }
    };

    window.GoalsModule = {
      bind() {
        document.getElementById('goal-save-btn')?.addEventListener('click', async () => {
          const name = document.getElementById('goal-name')?.value.trim();
          const target = document.getElementById('goal-target')?.value;
          const current = document.getElementById('goal-current')?.value;
          if (!name) return Utils.showToast('Goal name is required.', 'error');
          const result = await ApiClient.serverCall('updateGoal', { name, target, current });
          if (!result.success) return Utils.showToast(result.error || 'Failed to save goal.', 'error');
          document.getElementById('goal-name').value = '';
          document.getElementById('goal-target').value = '';
          document.getElementById('goal-current').value = '';
          await this.load();
          Utils.showToast('Goal saved.', 'success');
        });
      },

      async load() {
        const result = await ApiClient.serverCall('getGoalsData');
        AppState.goals = result.data?.goals || [];
        this.render();
      },

      render() {
        const target = document.getElementById('goals-list');
        target.innerHTML = AppState.goals.map(goal => {
          const pct = goal.target > 0 ? Math.min(100, (goal.current / goal.target) * 100) : 0;
          return `
            <div class="goal-card">
              <div class="goal-top">
                <strong>${Utils.escapeHtml(goal.name)}</strong>
                <span>${Utils.formatPct(pct)}</span>
              </div>
              <div class="progress"><div style="width:${pct}%"></div></div>
              <div class="muted">${Utils.formatCurrency(goal.current)} of ${Utils.formatCurrency(goal.target)}</div>
            </div>
          `;
        }).join('') || '<div class="signal-card">No goals yet.</div>';
      }
    };

    window.CalendarModule = {
      bind() {
        document.getElementById('calendar-prev')?.addEventListener('click', () => this.shift(-1));
        document.getElementById('calendar-next')?.addEventListener('click', () => this.shift(1));
        document.getElementById('calendar-today')?.addEventListener('click', async () => {
          AppState.calendar.anchorDate = new Date().toISOString().slice(0, 10);
          await this.load();
        });
        document.getElementById('calendar-month')?.addEventListener('click', async () => {
          AppState.calendar.view = 'month';
          this.syncViewButtons();
          await this.load();
        });
        document.getElementById('calendar-week')?.addEventListener('click', async () => {
          AppState.calendar.view = 'week';
          this.syncViewButtons();
          await this.load();
        });
        document.getElementById('calendar-note-save')?.addEventListener('click', () => this.saveNote());
        document.getElementById('calendar-note-delete')?.addEventListener('click', () => this.deleteNote());
      },

      syncViewButtons() {
        const monthBtn = document.getElementById('calendar-month');
        const weekBtn = document.getElementById('calendar-week');
        if (monthBtn) monthBtn.classList.toggle('active', AppState.calendar.view === 'month');
        if (weekBtn) weekBtn.classList.toggle('active', AppState.calendar.view === 'week');
      },

      async load() {
        const result = await ApiClient.serverCall('getCalendarData', { view: AppState.calendar.view, anchorDate: AppState.calendar.anchorDate });
        AppState.calendar.data = result.data;
        this.render();
      },

      async shift(direction) {
        const base = new Date(AppState.calendar.anchorDate);
        if (AppState.calendar.view === 'week') base.setDate(base.getDate() + 7 * direction);
        else base.setMonth(base.getMonth() + direction);
        AppState.calendar.anchorDate = base.toISOString().slice(0, 10);
        await this.load();
      },

      render() {
        this.syncViewButtons();
        const data = AppState.calendar.data;
        if (!data) return;
        const grid = document.getElementById('calendar-grid');
        const todayIso = new Date().toISOString().slice(0, 10);
        document.getElementById('calendar-title').textContent = `${data.view === 'week' ? 'Week' : 'Month'} · ${data.startDate} to ${data.endDate}`;
        grid.innerHTML = data.days.map(day => `
          <button class="calendar-day ${day.date === todayIso ? 'is-today' : ''}" data-date="${day.date}">
            <div class="calendar-day-header">
              <strong>${Utils.escapeHtml(day.dayName)} ${day.dayNumber}</strong>
              <span>${Utils.escapeHtml(day.note?.emoji || '')}</span>
            </div>
            <div class="muted">Income ${Utils.formatCurrency(day.income)}</div>
            <div class="muted">Expense ${Utils.formatCurrency(day.expense)}</div>
            <div class="${day.net >= 0 ? 'text-income' : 'text-expense'}">${Utils.formatSigned(day.net)}</div>
            <div class="calendar-note">${Utils.escapeHtml(day.note?.note || '')}</div>
          </button>
        `).join('');
        grid.querySelectorAll('.calendar-day').forEach(btn => {
          btn.addEventListener('click', () => this.openDay(btn.dataset.date));
        });
      },

      async openDay(date) {
        AppState.calendar.activeDate = date;
        const result = await ApiClient.serverCall('getCalendarDayData', { date });
        AppState.calendar.activeDayData = result.data;
        document.getElementById('calendar-modal-title').textContent = `Day details · ${date}`;
        document.getElementById('calendar-modal-summary').innerHTML = `
          <span class="pill">Income ${Utils.formatCurrency(result.data.income)}</span>
          <span class="pill">Expense ${Utils.formatCurrency(result.data.expense)}</span>
          <span class="pill">Net ${Utils.formatSigned(result.data.net)}</span>
        `;
        document.getElementById('calendar-note-emoji').value = result.data.note?.emoji || '';
        document.getElementById('calendar-note-text').value = result.data.note?.note || '';
        document.getElementById('calendar-modal-transactions').innerHTML = (result.data.transactions || []).map(tx => `
          <div class="list-item">
            <div>
              <strong>${Utils.escapeHtml(tx.description)}</strong>
              <div class="muted">${Utils.escapeHtml(tx.category || 'Uncategorized')}</div>
            </div>
            <div class="${tx.amount >= 0 ? 'text-income' : 'text-expense'}">${Utils.formatSigned(tx.amount)}</div>
          </div>
        `).join('') || '<div class="signal-card">No transactions for this day.</div>';
        document.getElementById('calendar-modal').classList.remove('hidden');
      },

      async saveNote() {
        if (!AppState.calendar.activeDate) return;
        const emoji = document.getElementById('calendar-note-emoji')?.value.trim();
        const note = document.getElementById('calendar-note-text')?.value.trim();
        const result = await ApiClient.serverCall('saveCalendarNote', { date: AppState.calendar.activeDate, emoji, note });
        if (!result.success) return Utils.showToast(result.error || 'Failed to save note.', 'error');
        Utils.showToast('Calendar note saved.', 'success');
        await this.load();
        await this.openDay(AppState.calendar.activeDate);
      },

      async deleteNote() {
        if (!AppState.calendar.activeDate) return;
        const result = await ApiClient.serverCall('deleteCalendarNote', { date: AppState.calendar.activeDate });
        if (!result.success) return Utils.showToast(result.error || 'Failed to delete note.', 'error');
        Utils.showToast('Calendar note deleted.', 'success');
        await this.load();
        await this.openDay(AppState.calendar.activeDate);
      }
    };

    window.InsightsModule = {
      render() {
        document.getElementById('ai-insights').innerHTML = `
          <div class="signal-card">
            <strong>AI summary</strong>
            <div class="muted">${Utils.escapeHtml(AppState.insights || 'Insights will appear once enough data is available.')}</div>
          </div>
        `;
        const recurring = AppState.bundle?.lists?.recurringCandidates || [];
        const actions = [
          { title: 'Review top merchant', body: AppState.bundle?.lists?.topMerchants?.[0]?.name || 'No merchant pattern yet' },
          { title: 'Budget attention', body: AppState.budgets.length ? 'Open the budget page to review actual vs plan.' : 'Create your first budget with smart suggestions.' }
        ].concat(recurring.slice(0, 3).map(item => ({
          title: item.description || 'Recurring signal',
          body: `Potential recurring spend around ${Utils.formatCurrency(item.avgAmount || item.amount || 0)}`
        })));
        document.getElementById('insight-actions').innerHTML = actions.map(a => `
          <div class="signal-card">
            <strong>${Utils.escapeHtml(a.title)}</strong>
            <div class="muted">${Utils.escapeHtml(a.body)}</div>
          </div>
        `).join('');
      }
    };

    window.SettingsModule = {
      bind() {
        document.getElementById('save-settings-btn')?.addEventListener('click', () => this.saveSource());
        document.getElementById('test-source-btn')?.addEventListener('click', () => this.testSource());
      },

      async load() {
        const [settings, sourceInfo] = await Promise.all([
          ApiClient.serverCall('loadUserSettings'),
          ApiClient.serverCall('getSourceInfo')
        ]);
        AppState.settings = settings.data || {};
        AppState.sourceInfo = sourceInfo.data || {};
        this.render();
      },

      render() {
        const paydayEl = document.getElementById('payday-day');
        const balanceEl = document.getElementById('balance-override');
        if (paydayEl) paydayEl.value = AppState.settings.paydayDay != null && AppState.settings.paydayDay !== '' ? String(AppState.settings.paydayDay) : '';
        if (balanceEl) balanceEl.value = AppState.settings.balanceOverride != null && AppState.settings.balanceOverride !== '' ? String(AppState.settings.balanceOverride) : '';
        document.getElementById('source-type').value = AppState.settings.source || 'active';
        document.getElementById('external-sheet-id').value = AppState.settings.externalId || AppState.sourceInfo.sourceSpreadsheetId || '';
        document.getElementById('source-info').innerHTML = [
          { label: 'Sheet', value: AppState.sourceInfo.spreadsheetName || 'Unknown' },
          { label: 'Records', value: String(AppState.sourceInfo.recordCount || 0) },
          { label: 'Transaction tab', value: AppState.sourceInfo.txSheet || 'Transactions' }
        ].map(item => `<div class="source-row"><strong>${Utils.escapeHtml(item.label)}</strong><div class="muted">${Utils.escapeHtml(item.value)}</div></div>`).join('');
        StateManager.renderThemes();
      },

      async saveSource() {
        const sourceType = document.getElementById('source-type').value;
        const externalId = document.getElementById('external-sheet-id').value.trim();
        const paydayRaw = document.getElementById('payday-day')?.value?.trim();
        const balanceRaw = document.getElementById('balance-override')?.value?.trim();
        const paydayDay = paydayRaw ? Math.min(31, Math.max(1, parseInt(paydayRaw, 10) || 3)) : null;
        const balanceOverride = balanceRaw === '' ? null : (!isNaN(Number(balanceRaw)) ? Number(balanceRaw) : AppState.settings.balanceOverride);
        const result = await ApiClient.serverCall('updateDataSource', sourceType, externalId);
        if (result.status !== 'success') return Utils.showToast(result.message || 'Failed to save source settings.', 'error');
        await ApiClient.serverCall('saveUserSettings', { ...AppState.settings, source: sourceType, externalId, theme: AppState.theme, paydayDay, balanceOverride });
        Utils.showToast('Settings saved.', 'success');
        await this.load();
        await DataLoader.reloadAll();
      },

      async testSource() {
        const externalId = document.getElementById('external-sheet-id').value.trim();
        if (!externalId) return Utils.showToast('Enter a Google Sheet ID first.', 'error');
        const result = await ApiClient.serverCall('testExternalConnection', externalId);
        Utils.showToast(result.success ? `Connected to ${result.name}.` : (result.message || 'Connection failed'), result.success ? 'success' : 'error');
      }
    };

    window.SystemModule = {
      bind() {
        document.getElementById('refresh-logs-btn')?.addEventListener('click', () => this.load());
        const copyBtn = document.getElementById('copy-diagnostics-btn');
        if (copyBtn) copyBtn.addEventListener('click', () => this.copyDiagnostics());
        const showLabsEl = document.getElementById('show-labs-toggle');
        if (showLabsEl) {
          showLabsEl.checked = AppState.showLabs;
          showLabsEl.addEventListener('change', function() {
            AppState.showLabs = showLabsEl.checked;
            try { localStorage.setItem('classicShowLabs', AppState.showLabs ? '1' : '0'); } catch (e) {}
            StateManager.updateLabsNavVisibility();
            Utils.showToast(AppState.showLabs ? 'Developer tools visible in sidebar.' : 'Developer tools hidden.');
          });
        }
      },

      async load() {
        const showLabsEl = document.getElementById('show-labs-toggle');
        if (showLabsEl) showLabsEl.checked = AppState.showLabs;
        try {
          const [health, diagnostics, logs] = await Promise.all([
            ApiClient.serverCall('getHealthReport'),
            ApiClient.serverCall('getDiagnostics'),
            ApiClient.serverCall('getSystemLogEntries')
          ]);
          AppState.healthReport = health?.data || (typeof health?.score === 'number' ? health : null);
          AppState.diagnostics = diagnostics?.connection !== undefined ? diagnostics : null;
          AppState.logs = logs?.entries || logs?.data?.entries || [];
          AppState.systemLoadError = null;
        } catch (e) {
          AppState.healthReport = null;
          AppState.diagnostics = null;
          AppState.logs = [];
          AppState.systemLoadError = e?.message || 'Failed to load system data.';
        }
        this.render();
      },

      render() {
        const err = AppState.systemLoadError;
        document.getElementById('health-report').innerHTML = err
          ? `<div class="signal-card alert-banner">${Utils.escapeHtml(err)}</div>`
          : (AppState.healthReport ? `
            <div class="signal-card"><strong>Quality score</strong><div>${Utils.escapeHtml(String(AppState.healthReport.score))}/100</div></div>
            <div class="signal-card"><strong>Missing categories</strong><div>${Utils.escapeHtml(String(AppState.healthReport.issues?.missingCategory || 0))}</div></div>
            <div class="signal-card"><strong>Possible duplicates</strong><div>${Utils.escapeHtml(String((AppState.healthReport.issues?.duplicates || []).length))}</div></div>
            <div class="signal-card"><strong>Future dates</strong><div>${Utils.escapeHtml(String(AppState.healthReport.issues?.futureDates || 0))}</div></div>
          ` : '<div class="signal-card">Health report unavailable.</div>');
        document.getElementById('diagnostics-report').innerHTML = AppState.diagnostics ? `
          <div class="signal-card"><strong>Connection</strong><div class="muted">${Utils.escapeHtml(JSON.stringify(AppState.diagnostics.connection || {}))}</div></div>
          <div class="signal-card"><strong>Last error</strong><div class="muted">${Utils.escapeHtml(JSON.stringify(AppState.diagnostics.lastError || 'None'))}</div></div>
          <div class="signal-card"><strong>Cache age</strong><div class="muted">${Utils.escapeHtml(String(AppState.diagnostics.cacheAgeMs || 0))} ms</div></div>
        ` : (err ? '<div class="signal-card muted">Diagnostics could not be loaded.</div>' : '<div class="signal-card">Diagnostics unavailable.</div>');
        document.getElementById('system-logs').textContent = AppState.logs.length
          ? AppState.logs.map(entry => `[${entry.level || 'INFO'}] ${entry.message || ''} (${entry.module || entry.source || 'System'})`).join('\n')
          : 'No recent logs.';
      },

      copyDiagnostics() {
        try {
          const payload = {
            buildInfo: AppState.buildInfo,
            route: AppState.route,
            range: Utils.currentRangeOpts(),
            sourceInfo: AppState.sourceInfo || {},
            diagnostics: AppState.diagnostics || {},
            healthReport: AppState.healthReport || {},
            lastLogs: (AppState.logs || []).slice(-10)
          };
          const content = JSON.stringify(payload, null, 2);
          if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(content).then(() => Utils.showToast('Diagnostics copied to clipboard.', 'success'));
          } else {
            Utils.showToast('Clipboard unavailable in this browser.', 'error');
          }
        } catch (e) {
          Utils.showToast('Failed to copy diagnostics.', 'error');
        }
      }
    };

    window.ForecastModule = {
      bind() {
        document.getElementById('add-account-btn')?.addEventListener('click', () => {
          AppState.accounts.push({ name: '', balance: 0 });
          this.renderAccounts();
        });
        document.getElementById('save-accounts-btn')?.addEventListener('click', () => this.save());
      },

      async load() {
        const accounts = await ApiClient.serverCall('getAccounts');
        AppState.accounts = Array.isArray(accounts) ? accounts : [];
        this.renderAccounts();
        this.renderChart();
      },

      renderAccounts() {
        const target = document.getElementById('accounts-list');
        target.innerHTML = AppState.accounts.map((acc, idx) => `
          <div class="account-row">
            <input class="control-input account-name" data-index="${idx}" value="${Utils.escapeHtml(acc.name || '')}" placeholder="Account name">
            <input class="control-input account-balance" data-index="${idx}" type="number" value="${Number(acc.balance) || 0}">
          </div>
        `).join('') || '<div class="signal-card">No accounts yet.</div>';
        target.querySelectorAll('.account-name').forEach(input => {
          input.addEventListener('input', e => { AppState.accounts[Number(e.target.dataset.index)].name = e.target.value; });
        });
        target.querySelectorAll('.account-balance').forEach(input => {
          input.addEventListener('input', e => { AppState.accounts[Number(e.target.dataset.index)].balance = Number(e.target.value) || 0; });
        });
      },

      renderChart() {
        const forecast = AppState.chartPack?.forecast;
        if (!forecast) return;
        const node = document.getElementById('forecast-chart');
        if (!node) return;
        Plotly.react(node, [{
          x: forecast.labels,
          y: forecast.balance,
          type: 'scatter',
          mode: 'lines+markers',
          line: { color: '#79a8ff', width: 3 }
        }], ChartRenderer.baseLayout(''), { displayModeBar: false, responsive: true });
      },

      async save() {
        const payload = {
          assets: AppState.accounts.filter(a => Number(a.balance) >= 0).map(a => ({ name: a.name || 'Asset', value: Number(a.balance) || 0 })),
          liabilities: AppState.accounts.filter(a => Number(a.balance) < 0).map(a => ({ name: a.name || 'Liability', value: Math.abs(Number(a.balance) || 0) }))
        };
        const result = await ApiClient.serverCall('saveNetWorth', payload);
        Utils.showToast(result.status === 'success' ? 'Accounts saved.' : (result.message || 'Save failed'), result.status === 'success' ? 'success' : 'error');
      }
    };

    window.LabsModule = {
      bind() {
        document.getElementById('labs-test-btn')?.addEventListener('click', () => this.runTest());
        document.getElementById('labs-clear-cache-btn')?.addEventListener('click', () => this.clearCaches());
        document.getElementById('labs-reload-btn')?.addEventListener('click', () => DataLoader.reloadAll());
        document.getElementById('import-btn')?.addEventListener('click', () => this.importCsv());
      },

      async runTest() {
        const result = await ApiClient.serverCall('testGetDashboardData');
        document.getElementById('labs-results').innerHTML = `
          <div class="signal-card">
            <strong>testGetDashboardData</strong>
            <div class="muted">${Utils.escapeHtml(result.success ? 'Success' : (result.error || 'Failed'))}</div>
          </div>
        `;
      },

      async clearCaches() {
        const result = await ApiClient.serverCall('labsClearCaches');
        Utils.showToast(result.status === 'success' ? 'Caches cleared.' : (result.message || 'Failed to clear caches'), result.status === 'success' ? 'success' : 'error');
      },

      async importCsv() {
        const input = document.getElementById('import-file');
        const file = input.files?.[0];
        if (!file) return Utils.showToast('Choose a CSV file first.', 'error');
        const text = await file.text();
        const rows = parseCsv(text);
        if (!rows.length) return Utils.showToast('No importable rows were found.', 'error');
        Utils.showLoader(true);
        try {
          const result = await ApiClient.serverCall('processImportData', rows);
          if (!result || result.success === false) throw new Error(result?.message || 'Import failed');
          Utils.showToast(`Imported ${result.count || 0} rows.`, 'success');
          await DataLoader.reloadAll();
        } catch (error) {
          Utils.showToast(error.message, 'error');
        } finally {
          Utils.showLoader(false);
        }
      }
    };

    window.ExportModule = {
      async exportCsv() {
        const result = await ApiClient.serverCall('exportData', Utils.currentRangeOpts());
        if (!result.success) return Utils.showToast(result.error || 'Export failed.', 'error');
        const blob = new Blob([result.data.content], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = result.data.filename || 'export.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        Utils.showToast(`Exported ${result.data.rowCount || 0} rows.`, 'success');
      }
    };

    window.CommandPalette = {
      bind() {
        document.getElementById('command-search')?.addEventListener('input', () => this.render());
      },

      open() {
        const palette = document.getElementById('command-palette');
        if (palette) {
          palette.classList.remove('hidden');
          document.getElementById('command-search').value = '';
          this.render();
          document.getElementById('command-search').focus();
        }
      },

      items() {
        return [
          ...Object.keys(PageMeta).map(route => ({
            label: `Go to ${PageMeta[route][0]}`,
            detail: PageMeta[route][1],
            run: () => Router.go(route)
          })),
          { label: 'Sync from source', detail: 'Refresh backend data and reload the dashboard.', run: () => document.getElementById('sync-btn')?.click() },
          { label: 'Export current range', detail: 'Download CSV for the selected range.', run: () => document.getElementById('export-btn')?.click() },
          { label: 'Reload diagnostics', detail: 'Refresh health, diagnostics, and logs.', run: () => SystemModule.load() }
        ];
      },

      render() {
        const term = document.getElementById('command-search')?.value.trim().toLowerCase() || '';
        const target = document.getElementById('command-results');
        const items = this.items().filter(item => !term || item.label.toLowerCase().includes(term) || item.detail.toLowerCase().includes(term));
        target.innerHTML = items.map((item, idx) => `
          <button class="command-item" data-command-index="${idx}">
            <strong>${Utils.escapeHtml(item.label)}</strong>
            <div class="muted">${Utils.escapeHtml(item.detail)}</div>
          </button>
        `).join('') || '<div class="signal-card">No matching command.</div>';
        target.querySelectorAll('[data-command-index]').forEach((btn, idx) => {
          btn.addEventListener('click', () => {
            items[idx].run();
            document.getElementById('command-palette')?.classList.add('hidden');
          });
        });
      }
    };

    // =========================================================================
    // 10. CSV PARSER (kept as is)
    // =========================================================================
    function parseCsv(text) {
      const rows = text.split(/\r?\n/).filter(Boolean);
      if (rows.length < 2) return [];
      const headers = parseCsvLine(rows[0]).map(h => h.trim().toLowerCase());
      const dateIndex = headers.indexOf('date');
      const descriptionIndex = headers.indexOf('description');
      const amountIndex = headers.indexOf('amount');
      const categoryIndex = headers.indexOf('category');
      if (dateIndex < 0 || descriptionIndex < 0 || amountIndex < 0) return [];
      return rows.slice(1).map(parseCsvLine).filter(cols => cols.length >= 3).map(cols => ({
        date: cols[dateIndex],
        description: cols[descriptionIndex],
        amount: cols[amountIndex],
        category: categoryIndex >= 0 ? cols[categoryIndex] : 'Uncategorized'
      })).filter(row => row.date && row.description && row.amount !== '');
    }

    function parseCsvLine(line) {
      const values = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const next = line[i + 1];
        if (char === '"' && inQuotes && next === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current);
      return values.map(v => v.trim());
    }

    // =========================================================================
    // 11. GLOBAL UI BINDING & INITIALIZATION
    // =========================================================================
    function bindGlobalUI() {
      // Range select
      const rangeSelect = document.getElementById('range-select');
      if (rangeSelect) rangeSelect.addEventListener('change', handleRangeChange);

      const applyRangeBtn = document.getElementById('apply-range-btn');
      if (applyRangeBtn) applyRangeBtn.addEventListener('click', () => DataLoader.reloadRangeData(true));

      // Sync
      document.getElementById('sync-btn')?.addEventListener('click', async () => {
        try {
          Utils.showLoader(true);
          const result = await ApiClient.serverCall('syncFromSourceSheet');
          Utils.showToast(result.status === 'ok' ? `Synced ${result.rowsSynced || 0} rows.` : (result.message || 'Sync failed'), result.status === 'ok' ? 'success' : 'error');
          await DataLoader.reloadAll();
        } catch (error) {
          Utils.showToast(error.message, 'error');
        } finally {
          Utils.showLoader(false);
        }
      });

      // Export
      document.getElementById('export-btn')?.addEventListener('click', ExportModule.exportCsv);

      // Switch to enhanced
      const switchEnhanced = document.getElementById('switch-to-enhanced');
      if (switchEnhanced) {
        switchEnhanced.addEventListener('click', e => {
          e.preventDefault();
          const base = window.location.origin + window.location.pathname;
          window.top.location.href = base + (base.includes('?') ? '&' : '?') + 'view=sacred';
        });
      }

      // Command palette
      document.getElementById('command-btn')?.addEventListener('click', CommandPalette.open);

      // Data-route jumps
      document.querySelectorAll('[data-route-jump]').forEach(btn => {
        btn.addEventListener('click', () => Router.go(btn.dataset.routeJump));
      });

      // Close buttons
      document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => document.getElementById(btn.dataset.close)?.classList.add('hidden'));
      });

      // Keyboard shortcuts
      document.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          CommandPalette.open();
        }
        if (event.key === 'Escape') {
          document.getElementById('calendar-modal')?.classList.add('hidden');
          document.getElementById('command-palette')?.classList.add('hidden');
        }
      });

      // Resize charts
      window.addEventListener('resize', Utils.debounce(() => {
        if (typeof Plotly === 'undefined') return;
        document.querySelectorAll('.chart-box').forEach(node => {
          try { Plotly.Plots.resize(node); } catch (e) {}
        });
      }, 150));

      // Bind module events
      TransactionsModule.bind();
      BudgetModule.bind();
      GoalsModule.bind();
      CalendarModule.bind();
      SettingsModule.bind();
      SystemModule.bind();
      LabsModule.bind();
      ForecastModule.bind();
      CommandPalette.bind();
    }

    function handleRangeChange() {
      AppState.range = document.getElementById('range-select').value;
      const isCustom = AppState.range === 'custom';
      document.getElementById('custom-from')?.classList.toggle('hidden', !isCustom);
      document.getElementById('custom-to')?.classList.toggle('hidden', !isCustom);
      document.getElementById('apply-range-btn')?.classList.toggle('hidden', !isCustom);
      if (!isCustom) {
        DataLoader.reloadRangeData(true);
      } else {
        AppState.fromIso = document.getElementById('custom-from')?.value || '';
        AppState.toIso = document.getElementById('custom-to')?.value || '';
      }
      StateManager.saveUiState();
    }

    // =========================================================================
    // 12. BOOTSTRAP
    // =========================================================================
    document.addEventListener('DOMContentLoaded', async () => {
      StateManager.restoreUiState();
      StateManager.applyTheme(AppState.theme);
      bindGlobalUI();
      Router.init();
      await DataLoader.bootstrap();
    });

  