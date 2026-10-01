// Apps Script Web App: handles all WRITE operations (add/update/delete) against the
// "Meal Plan App Data" spreadsheet. Reads are done client-side directly against the
// Sheets API v4 REST endpoint with an API key (see js/store.js) — this script is never
// used for reads, only writes, so it stays a thin dispatcher around SpreadsheetApp.
//
// Deploy as: Web App, execute as "Me", access "Anyone" (see README in this folder).

const SHEET_RECIPES = "Recipes";
const SHEET_INSTRUCTIONS = "Instructions";
const SHEET_SHOPPING_LIST = "Shopping List";

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const action = body.action;

  try {
    let result;
    switch (action) {
      case "addShoppingItem": result = addShoppingItem(body); break;
      case "updateShoppingItem": result = updateShoppingItem(body); break;
      case "deleteCheckedShoppingItems": result = deleteCheckedShoppingItems(); break;
      case "addRecipe": result = addRecipe(body); break;
      case "updateRecipe": result = updateRecipe(body); break;
      case "deleteRecipe": result = deleteRecipe(body); break;
      default: throw new Error("Unknown action: " + action);
    }
    return jsonResponse({ ok: true, result: result });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error("Sheet tab not found: " + name);
  return sheet;
}

// Reads a sheet into { headers, rows } where rows are 1-based sheet row numbers
// paired with their values, so callers can target exact rows for update/delete.
function readSheet(name) {
  const sheet = getSheet(name);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const rows = values.slice(1).map((row, i) => ({ rowNumber: i + 2, values: row }));
  return { sheet, headers, rows };
}

function colIndex(headers, name) {
  const idx = headers.indexOf(name);
  if (idx === -1) throw new Error("Column not found: " + name);
  return idx;
}

// ---------- Shopping List ----------
// Columns: Ingredient, Store Section, Quantity, Active Flag (1/0)
// "Ingredient" is the primary key: add() creates-or-updates by ingredient name.

function findShoppingRowByIngredient(ingredient) {
  const { sheet, headers, rows } = readSheet(SHEET_SHOPPING_LIST);
  const ingCol = colIndex(headers, "Ingredient");
  const match = rows.find((r) => String(r.values[ingCol]).trim().toLowerCase() === ingredient.trim().toLowerCase());
  return { sheet, headers, match };
}

function addShoppingItem(body) {
  const { sheet, headers, match } = findShoppingRowByIngredient(body.item);
  const secCol = colIndex(headers, "Store Section");
  const qtyCol = colIndex(headers, "Quantity");
  const activeCol = colIndex(headers, "Active Flag");

  if (match) {
    sheet.getRange(match.rowNumber, secCol + 1).setValue(body.section);
    sheet.getRange(match.rowNumber, qtyCol + 1).setValue(body.quantity);
    sheet.getRange(match.rowNumber, activeCol + 1).setValue(1);
    return { updated: true, ingredient: body.item };
  }

  const row = [];
  row[colIndex(headers, "Ingredient")] = body.item;
  row[secCol] = body.section;
  row[qtyCol] = body.quantity;
  row[activeCol] = 1;
  sheet.appendRow(row);
  return { created: true, ingredient: body.item };
}

// body: { originalItem, item, quantity, section, active }
// originalItem identifies the existing row; the rest are the new values to write.
function updateShoppingItem(body) {
  const { sheet, headers, match } = findShoppingRowByIngredient(body.originalItem);
  if (!match) throw new Error("Shopping item not found: " + body.originalItem);

  const ingCol = colIndex(headers, "Ingredient");
  const secCol = colIndex(headers, "Store Section");
  const qtyCol = colIndex(headers, "Quantity");
  const activeCol = colIndex(headers, "Active Flag");

  if (body.item !== undefined) sheet.getRange(match.rowNumber, ingCol + 1).setValue(body.item);
  if (body.section !== undefined) sheet.getRange(match.rowNumber, secCol + 1).setValue(body.section);
  if (body.quantity !== undefined) sheet.getRange(match.rowNumber, qtyCol + 1).setValue(body.quantity);
  if (body.active !== undefined) sheet.getRange(match.rowNumber, activeCol + 1).setValue(body.active ? 1 : 0);

  return { updated: true };
}

function deleteCheckedShoppingItems() {
  const { sheet, headers, rows } = readSheet(SHEET_SHOPPING_LIST);
  const activeCol = colIndex(headers, "Active Flag");
  const toDelete = rows.filter((r) => Number(r.values[activeCol]) === 0);
  // Delete bottom-up so earlier row numbers stay valid as rows are removed.
  toDelete.sort((a, b) => b.rowNumber - a.rowNumber).forEach((r) => sheet.deleteRow(r.rowNumber));
  return { deleted: toDelete.length };
}

// ---------- Recipes + Instructions ----------
// Recipes tab: one row per ingredient (Recipe Name, Ingredient), name repeats.
// Instructions tab: one row per step (Recipe Name, Step Description, Step Number).
// Linked by exact Recipe Name match.

function deleteRowsForRecipe(sheetName, nameCol, name) {
  const { sheet, headers, rows } = readSheet(sheetName);
  const col = colIndex(headers, nameCol);
  const target = String(name).trim();
  const toDelete = rows.filter((r) => String(r.values[col]).trim() === target);
  deleteRowNumbers(sheet, toDelete.map((r) => r.rowNumber));
  return toDelete.length;
}

// Deletes the given 1-based row numbers, collapsing consecutive runs into a single
// deleteRows call (one API round-trip per run instead of one per row).
function deleteRowNumbers(sheet, rowNumbers) {
  const sorted = rowNumbers.slice().sort((a, b) => b - a);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] - 1) j++;
    sheet.deleteRows(sorted[j], j - i + 1);
    i = j + 1;
  }
}

function recipeExists(name) {
  const { headers, rows } = readSheet(SHEET_RECIPES);
  const col = colIndex(headers, "Recipe Name");
  return rows.some((r) => r.values[col] === name);
}

// body: { recipe: { name, ingredients: [string,...], instructions: [string,...] } }
function addRecipe(body) {
  if (recipeExists(body.recipe.name)) {
    throw new Error("A recipe named \"" + body.recipe.name + "\" already exists.");
  }
  writeRecipeRows(body.recipe);
  return { created: true, name: body.recipe.name };
}

// body: { originalName, recipe: { name, ingredients, instructions } }
function updateRecipe(body) {
  const renaming = body.originalName !== body.recipe.name;
  if (renaming && recipeExists(body.recipe.name)) {
    throw new Error("A recipe named \"" + body.recipe.name + "\" already exists.");
  }
  deleteRowsForRecipe(SHEET_RECIPES, "Recipe Name", body.originalName);
  deleteRowsForRecipe(SHEET_INSTRUCTIONS, "Recipe Name", body.originalName);
  writeRecipeRows(body.recipe);
  return { updated: true, name: body.recipe.name };
}

function deleteRecipe(body) {
  deleteRowsForRecipe(SHEET_RECIPES, "Recipe Name", body.name);
  deleteRowsForRecipe(SHEET_INSTRUCTIONS, "Recipe Name", body.name);
  return { deleted: true };
}

// Writes all rows for a tab with one setValues call instead of an appendRow per row,
// which is what made saving slow (each appendRow is its own round-trip).
function appendRows(sheet, rows) {
  if (!rows.length) return;
  const start = sheet.getLastRow() + 1;
  sheet.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
}

function writeRecipeRows(recipe) {
  const ingredients = recipe.ingredients && recipe.ingredients.length ? recipe.ingredients : [""];
  appendRows(getSheet(SHEET_RECIPES), ingredients.map((ing) => [recipe.name, ing]));

  const steps = (recipe.instructions || []).map((step, i) => [recipe.name, step, i + 1]);
  appendRows(getSheet(SHEET_INSTRUCTIONS), steps);
}
