// === Global variables ===

// Not required by the library
state.lastContext = state.lastContext || '';
state.lastInput = state.lastInput || '';
state.lastOutput = state.lastOutput || '';
state.debugMode = state.debugMode || false;
state.deepDebugMode = state.deepDebugMode || false;

// Required variables
state.debugOutput = state.debugOutput || '';
state.JackDefsMap = state.JackDefsMap || { TURN: "-1" };
// If you want empty Defs map use: Object.create(null);

// === Preprocess context text ===
// Performs C-preprocessor style processing for input text.
//
//   TURN define value is incremented every time.
//   WHAT_NEXT define value gets added after user input.
//
//   input    Text to be processed
//   return   Text after preprocessing
function JackPreprocess(input) {
  const lines = (input || "").split(/\r?\n/);
  const authorsNote = "[Author's note:";
  const out = [];
  const active = [true];

  // Always increment TURN
  let cur = parseInt(state.JackDefsMap.TURN, 10);
  if (isNaN(cur)) cur = -1;
  state.JackDefsMap.TURN = String(cur + 1);

  // Parse input context
  for (let line of lines) {
    let t = line;
    
    // Author's note can start a line
    if (t.startsWith(authorsNote)) {
      t = t.replace(authorsNote, '');
    }

    // Process lines that don't have directives
    t = t.trim();
    if (!t.startsWith("#")) {
      if (active[active.length - 1]) out.push(JackApplyMacros(line));
      continue;
    }

    // Process lines with directives
    const [directive, ...restArr] = t.split(/\s+/);
    const rest = restArr.join(" ");
    const parent = active[active.length - 1];
    
    switch (directive) {
      case "#define": {
        if (!parent) break;
        const m = rest.match(/^([A-Za-z0-9_]+)(?:\s+(.*))?$/);
        if (m) {
          let key = m[1];
          let val = m[2] ? JackEvalValue(m[2]) : (state.JackDefsMap[key] || "");
          state.JackDefsMap[key] = val;
          state.debugOutput += key + " <- " + val + "\n";
        }
        break;
      }
      case "#undef": {
        if (!parent) break;
        let key = rest.split(/\s+/)[0];
        delete state.JackDefsMap[key];
        state.debugOutput += key + " <- undefined\n";
        break;
      }
      case "#ifdef": {
        let key = rest.split(/\s+/)[0];
        active.push(parent && state.JackDefsMap.hasOwnProperty(key));
        break;
      }
      case "#ifndef": {
        let key = rest.split(/\s+/)[0];
        active.push(parent && !state.JackDefsMap.hasOwnProperty(key));
        break;
      }
      case "#if": {
        active.push(parent && JackCheckCondition(rest));
        break;
      }
      case "#else": {
        if (active.length > 1) {
          let prev = active.pop();
          const prev_parent = active[active.length - 1];
          active.push(prev_parent && !prev);
        }
        break;
      }
      case "#endif": {
        if (active.length > 1) active.pop();
        out.push(rest);
        break;
      }
    }
  }

  // Append WHAT_NEXT if defined
  if (state.JackDefsMap.hasOwnProperty("WHAT_NEXT")) {
    out.push("[AI guidance for continuation: " + state.JackDefsMap.WHAT_NEXT + " ]");
  }

  return out.join("\n");
}

// === Macro substitution ===
// Expand {KEY} → value
function JackApplyMacros(text) {
  return String(text).replace(/\{([A-Za-z0-9_]+)\}/g, (m, k) =>
    state.JackDefsMap.hasOwnProperty(k) ? state.JackDefsMap[k] : m
  );
}

// === Condition evaluation ===
function JackCheckCondition(expr) {
  try {
    expr = JackApplyMacros(expr);
    for (let k in state.JackDefsMap) {
      expr = expr.replace(new RegExp("\\b" + k + "\\b", "g"), state.JackDefsMap[k]);
    }
    return !!eval(expr);
  } catch (e) {
    state.debugOutput += "Cond error: " + e.message + "\n";
    return false;
  }
}

// === Try to evaluate arithmetic, fallback to string ===
function JackEvalValue(val) {
  let expanded = JackApplyMacros(val).trim();
  try {
    // allow only numbers and operators to be eval'd
    if (/^[0-9+\-*/().\s]+$/.test(expanded)) {
      let res = eval(expanded);
      if (typeof res === "number" && !isNaN(res)) return String(res);
    }
  } catch (e) {}
  return expanded;
}

// === Dump defines as text ===
function JackDumpDefs() {
  return Object.entries(state.JackDefsMap)
    .map(([k, v]) => k + "=" + v)
    .join(", ");
}
