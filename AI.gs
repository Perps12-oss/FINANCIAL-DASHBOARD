/**
 * AI INTEGRATION LAYER
 * Refactored for robustness and efficiency.
 */

/**
 * Suggests a category for a transaction via OpenAI API.
 * Includes retry with exponential backoff for transient failures.
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

  const maxRetries = 3;
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const options = {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: "Bearer " + apiKey },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
        timeout: _Config.AI.TIMEOUT_MS || 15000
      };

      const response = UrlFetchApp.fetch(_Config.AI.OPENAI.BASE, options);
      const responseCode = response.getResponseCode();
      const json = JSON.parse(response.getContentText());

      if (responseCode !== 200) {
        const isRetryable = responseCode >= 500 || responseCode === 429;
        if (isRetryable && attempt < maxRetries - 1) {
          Utilities.sleep(Math.pow(2, attempt) * 500);
          continue;
        }
        console.error("OpenAI API Error " + responseCode);
        return "Error (API)";
      }

      if (json.choices && json.choices[0] && json.choices[0].message) {
        let category = json.choices[0].message.content.trim();
        category = category.replace(/[^\w\s]/g, "");
        return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
      }
      return "Uncategorized";
    } catch (e) {
      lastError = e;
      if (attempt < maxRetries - 1) {
        Utilities.sleep(Math.pow(2, attempt) * 500);
      }
    }
  }

  console.error("AI Suggestion System Error:", lastError);
  return "Error (System)";
}

/**
 * Batch categorizes uncategorized transactions using AI.
 * Uses a single setValues() call instead of N setValue() calls.
 */
function batchCategorizeTransactions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(_Config.RUNTIME.TRANSACTION_SHEET_NAME);
  if (!sheet) {
    SpreadsheetApp.getUi().alert("Transaction sheet not found.");
    return 0;
  }

  const rawData = _getCoreTransactionData();
  const txs = _parseTransactions(rawData);
  const uncategorized = txs.filter(function(t) {
    return !t.category || t.category === "" || t.category === "Uncategorized" || t.category.indexOf("Error") >= 0;
  });

  if (uncategorized.length === 0) return 0;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const categoryColIndex = headers.indexOf("Category") + 1;
  if (categoryColIndex === 0) return 0;

  const apiKey = _Config.getUserProp_(_Config.KEYS.OPENAI_API_KEY);
  if (!apiKey) {
    SpreadsheetApp.getUi().alert("API Key missing.");
    return 0;
  }

  if (uncategorized.length > 50) {
    const ui = SpreadsheetApp.getUi();
    if (ui.alert("Process " + uncategorized.length + " transactions?", "This incurs costs.", ui.ButtonSet.YES_NO) !== ui.Button.YES) return 0;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var categoryRange = sheet.getRange(2, categoryColIndex, lastRow, categoryColIndex);
  var values = categoryRange.getValues();

  var categorized = 0;
  for (var i = 0; i < uncategorized.length; i++) {
    if (i > 0) Utilities.sleep(200);
    var tx = uncategorized[i];
    var suggestion = suggestCategory(tx.description);
    if (suggestion && suggestion.indexOf("Error") < 0) {
      var arrIdx = tx.arrayIndex;
      if (arrIdx >= 0 && arrIdx < values.length) {
        values[arrIdx][0] = suggestion;
        categorized++;
      }
    }
  }

  if (categorized > 0) {
    categoryRange.setValues(values);
  }

  _Config.clearCache_();
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