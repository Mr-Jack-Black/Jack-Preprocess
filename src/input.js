// NOTE: Adding this file is optional
// - it only includes user commands for deeper debug.

// Supported commands (case-insensitive):
//   /debug on          → enable debug mode
//   /debug off         → disable debug mode
//   /version           → script version info
//   /memory            → memory usage
//   /debug KEY=VALUE   → define KEY with VALUE
//   /debug KEY=null    → undefine KEY

const safeStringify = (value) => {
    const seen = new WeakSet();
    return JSON.stringify(
      value,
      (key, val) => {
        if (typeof val === "function") return "[Function]";
        if (typeof val === "symbol") return val.toString();
        if (typeof val === "object" && val !== null) {
          if (seen.has(val)) return "[Circular]";
          seen.add(val);
        }
        return val;
      },
      2
    );
  };

function JackCmdCheck(text) {
    
    // Avoid executing commands from intro texts.
    if (info.actionCount < 2) return text;

    // Case insensitive
    let lower = text.toLowerCase();

    if (lower.includes("/debug off")) {
        state.verboseLevel = LOG_SYS_ERROR;
    } else if (lower.includes("/debug on")) {
        state.verboseLevel = LOG_STORY;
    } else if (lower.includes("/debug deep")) {
        state.verboseLevel = LOG_CONTEXT;
    } else if (lower.includes("/debug var")) {
        state.verboseLevel = LOG_VAR;
    } else if (lower.includes("/log off")) {
        state.verboseLevel = LOG_OFF;
    } else if (lower.includes("/log error")) {
        state.verboseLevel = LOG_SYS_ERROR;
    } else if (lower.includes("/log warning")) {
        state.verboseLevel = LOG_WARNING;
    } else if (lower.includes("/log story")) {
        state.verboseLevel = LOG_STORY;
    } else if (lower.includes("/log var")) {
        state.verboseLevel = LOG_VAR;
    } else if (lower.includes("/log ai")) {
        state.verboseLevel = LOG_AI;
    } else if (lower.includes("/log command")) {
        state.verboseLevel = LOG_COMMAND;
    } else if (lower.includes("/log context")) {
        state.verboseLevel = LOG_CONTEXT;
    } else if (lower.includes("/version")) {
        state.debugOutput += "\nJackPreprocess " + VERSION;
    } else if (lower.includes("/memory")) {
        state.debugOutput += JackDebugStateSize("");
        let globalThisOut = "";
        try { globalThisOut = safeStringify(globalThis); }
        catch { globalThisOut = String(globalThis); }
        state.debugOutput += globalThisOut;
    }

    // Match generic "/debug key=value"
    let match = lower.match(/\/debug\s+([A-Za-z0-9_]+)\s*=\s*([^\s]+)/i);
    if (match) {
        let key = match[1];
        let value = match[2];

        if (/^null$/i.test(value)) {
            delete state.JackDefsMap[key];
        } else {
            state.JackDefsMap[key] = value;
        }
    }

    // Return same input, after removing commands
    return text.split(/\/debug /i)[0].trim();
}

// === INPUT-hook (data from user input) ===
const modifier = (text) => {

    // Optional: Only needed for deeper debug
    // (#debug-primitive works even without this)
    text = JackCmdCheck(text);

    // Optional: Used for input-modify primitives
    // Used by #user_success/#user_fail/#user_trusted/#user_suspicious
    text = JackAppendSuccessInfo(text);

    // Optional: LewdLeah Auto-Cards
    //text = AutoCards("input", text);

    // Optional: Store input to be available in {INPUT}
    state.lastInput = text;

    return {text};
}
modifier(text);
