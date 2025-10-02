// === Global variables (preserve existing state values if present) ===
state.lastContext = state.lastContext || '';
state.lastInput = state.lastInput || '';
state.lastOutput = state.lastOutput || '';
state.debugOutput = state.debugOutput || '';
state.debugMode = state.debugMode || false;
state.deepDebugMode = state.deepDebugMode || false;
state.JackDefsMap = state.JackDefsMap || { TURN: "-1" };

// === Preprocess input/output text ===
function JackPreprocess(textInput) {
  // Update TURN
  state.JackDefsMap.TURN = String(parseInt(state.JackDefsMap.TURN) + 1);

  let lines = textInput.split(/\r?\n/);
  let output = [];
  // stack: true = active, false = inactive
  let activeStack = [true];

  for (let line of lines) {
    let trimmed = line.trim();
    // Non-directive line
    if (!trimmed.startsWith("#")) {
      if (activeStack[activeStack.length - 1]) {
        output.push(JackApplyMacros(line));
      }
      continue;
    }

    // directive and rest-of-line
    // directive includes the leading '#', e.g. '#if'
    let parts = trimmed.split(/\s+/, 2);
    let directive = parts[0];
    let rest = trimmed.substring(directive.length).trim();

    // whether the current outer block is active
    let parentActive = activeStack[activeStack.length - 1];

    switch (directive) {
      case "#define": {
        // Only apply defines when in an active block
        if (!parentActive) break;
        // parse key and optional value from rest
        let m = rest.match(/^([A-Za-z0-9_]+)(?:\s+(.*))?$/s);
        if (m) {
          let key = m[1];
          let value = (typeof m[2] !== "undefined" && m[2] !== null) ? m[2] : (state.JackDefsMap[key] || "");
          state.JackDefsMap[key] = value;
        }
        break;
      }

      case "#undef": {
        // Only execute undef when in an active block
        if (!parentActive) break;
        let m = rest.match(/^([A-Za-z0-9_]+)\b/);
        if (m) {
          let key = m[1];
          delete state.JackDefsMap[key];
        }
        break;
      }

      case "#ifdef": {
        // Only symbol name matters for #ifdef/#ifndef
        let key = rest.split(/\s+/)[0] || "";
        let cond = parentActive ? state.JackDefsMap.hasOwnProperty(key) : false;
        // If parentActive is false, we still push false to keep nesting balanced
        activeStack.push(parentActive && cond);
        break;
      }

      case "#ifndef": {
        let key = rest.split(/\s+/)[0] || "";
        let cond = parentActive ? !state.JackDefsMap.hasOwnProperty(key) : false;
        activeStack.push(parentActive && cond);
        break;
      }

      case "#if": {
        // If parentActive is false, push false without evaluating
        if (!parentActive) {
          activeStack.push(false);
        } else {
          let expr = rest;
          let cond = JackCheckCondition(expr, state.JackDefsMap);
          activeStack.push(parentActive && !!cond);
        }
        break;
      }

      case "#endif": {
        // Pop if possible
        if (activeStack.length > 1) activeStack.pop();
        // Handle trailing text after #endif on same line:
        // rest already contains trailing text (if any).
        let newActive = activeStack[activeStack.length - 1];
        if (newActive && rest) {
          // If there is text after the directive on same line, include it
          output.push(JackApplyMacros(rest));
        }
        break;
      }

      default:
        // Unknown directive: ignore. If in inactive block, also ignore.
        break;
    }
  }

  return output.join("\n");
}

// === Macro substitution ===
function JackApplyMacros(line) {
  return line.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => {
    return state.JackDefsMap.hasOwnProperty(key) ? state.JackDefsMap[key] : match;
  });
}

// === Condition evaluation ===
function JackCheckCondition(condition, defs) {
  try {
    // Replace defined identifiers with their values (word-boundary)
    for (let key in defs) {
      let val = defs[key];
      condition = condition.replace(new RegExp("\\b" + key + "\\b", "g"), val);
    }
    // Remove whitespace to simplify eval input
    condition = condition.replace(/\s+/g, "");
    return JackEvalBooleanExpr(condition);
  } catch (e) {
    state.debugOutput += "Error: " + e.message;
    return false;
  }
}

function JackEvalBooleanExpr(expr) {
  try {
    // Using JS eval for expression evaluation (comparisons, &&, ||, !, numbers)
    return !!eval(expr);
  } catch (e) {
    state.debugOutput += "Eval error: " + e.message;
    return false;
  }
}

// === Dump defines ===
function JackDumpDefs() {
  let pairs = [];
  for (let key in state.JackDefsMap) {
    pairs.push(key + "=" + state.JackDefsMap[key]);
  }
  return pairs.join(", ");
}
