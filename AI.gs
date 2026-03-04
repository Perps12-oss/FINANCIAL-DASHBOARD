/**
 * AI INTEGRATION LAYER
 * Refactored for robustness and efficiency.
 */

function suggestCategory(description) {
  const apiKey = _Config.getUserProp_(_Config.KEYS.OPENAI_API_KEY);
  if (!apiKey) return "Uncategorized (No API Key)";
  
  if (!description || typeof description !== 'string' || description.trim() === '') return "Uncategorized";

  const prompt = `Categorize the following financial transaction into exactly one word.
Allowed Categories: Groceries, Rent, Salary, Entertainment, Utilities, Dining, Shopping, Transport, Healthcare, Education, Travel, Subscription, Other.
Transaction: "${description}"
Category:`;

  const payload = {
    model: _Config.AI.OPENAI.MODEL,
    messages: [
      { role: "system", content: "You are a financial assistant. Respond with only the category name. No punctuation." },
      { role: "user", content: prompt }
    ],
    temperature: 0.1,
    max_tokens: 10
  };

  const options = {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    timeout: _Config.AI.TIMEOUT_MS || 15000
  };

  try {
    const response = UrlFetchApp.fetch(_Config.AI.OPENAI.BASE, options);
    const responseCode = response.getResponseCode();
    const json = JSON.parse(response.getContentText());

    if (responseCode !== 200) {
      console.error(`OpenAI API Error ${responseCode}`);
      return "Error (API)";
    }

    if (json.choices && json.choices[0] && json.choices[0].message) {
      let category = json.choices[0].message.content.trim();
      category = category.replace(/[^\w\s]/g, ''); // Remove punctuation
      return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
    }
    return "Uncategorized";
  } catch (e) {
    console.error('AI Suggestion System Error:', e);
    return "Error (System)";
  }
}

function batchCategorizeTransactions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const rawData = _getCoreTransactionData();
  const txs = _parseTransactions(rawData);
  const uncategorized = txs.filter(t => !t.category || t.category === '' || t.category === 'Uncategorized' || t.category.includes('Error'));
  
  if (uncategorized.length === 0) return 0;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const categoryColIndex = headers.indexOf("Category") + 1;
  if (categoryColIndex === 0) return 0;

  const apiKey = _Config.getUserProp_(_Config.KEYS.OPENAI_API_KEY);
  if (!apiKey) { SpreadsheetApp.getUi().alert("API Key missing."); return 0; }

  let categorized = 0;
  if (uncategorized.length > 50) {
    const ui = SpreadsheetApp.getUi();
    if (ui.alert(`Process ${uncategorized.length} transactions?`, "This incurs costs.", ui.ButtonSet.YES_NO) !== ui.Button.YES) return 0;
  }

  uncategorized.forEach((tx, index) => {
    if (index > 0) Utilities.sleep(200);
    const suggestion = suggestCategory(tx.description);
    if (suggestion && !suggestion.includes('Error')) {
      const row = tx.rowIndex || (tx.arrayIndex + 2);
      sheet.getRange(row, categoryColIndex).setValue(suggestion);
      categorized++;
    }
  });
  return categorized;
}

function generateInsights() {
  const txs = _parseTransactions(_getCoreTransactionData());
  const currency = _Config.RUNTIME.CURRENCY_SYMBOL || '£';
  if (!txs || txs.length === 0) return [];

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
  const prevMonth = prevMonthDate.getMonth();
  const prevYear = prevMonthDate.getFullYear();

  let thisMonthExpense = 0, lastMonthExpense = 0;
  const categorySpend = {};

  txs.forEach(t => {
    if (!t.date) return;
    const d = new Date(t.date);
    if (isNaN(d.getTime())) return;
    const amount = parseFloat(t.amount) || 0;
    const absAmount = Math.abs(amount);
    const tMonth = d.getMonth();
    const tYear = d.getFullYear();

    if (tMonth === currentMonth && tYear === currentYear) {
      if (amount < 0) {
        thisMonthExpense += absAmount;
        const cat = t.category || 'Uncategorized';
        categorySpend[cat] = (categorySpend[cat] || 0) + absAmount;
      }
    } else if (tMonth === prevMonth && tYear === prevYear) {
      if (amount < 0) lastMonthExpense += absAmount;
    }
  });

  const insights = [];
  if (lastMonthExpense > 0) {
    const change = ((thisMonthExpense - lastMonthExpense) / lastMonthExpense) * 100;
    if (Math.abs(change) > 10) insights.push({ type: change > 0 ? 'warning' : 'success', message: `Spending ${change > 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(1)}% vs last month.` });
  }
  
  const sortedCategories = Object.entries(categorySpend).sort((a, b) => b[1] - a[1]);
  if (sortedCategories.length > 0) {
    const [topCat, topAmt] = sortedCategories[0];
    insights.push({ type: 'info', message: `Top category: ${topCat} (${currency}${topAmt.toFixed(2)})` });
  }
  return insights;
}