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