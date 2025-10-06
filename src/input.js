// NOTE: Adding this file is optional
// - it only includes user commands for deeper debug.

// Supported commands (case-insensitive):
//   /debug on          → enable debug mode
//   /debug off         → disable debug mode
//   /debug deep        → deep debug mode (a lot)
//   /debug simple      → "/debug on" alias
//   /debug KEY=VALUE   → define KEY with VALUE
//   /debug KEY=null    → undefine KEY
function JackCmdCheck(text) {
    
    // Avoid executing commands from intro texts.
    if (info.actionCount < 2) return text;

    // Case insensitive
    let lower = text.toLowerCase();

    // Do not process commands within SYSTEM messages.
    //lower = lower.replace(/<SYSTEM>[\s\S]*?<\/SYSTEM>/g, '');

    if (lower.includes("/debug off")) {
        state.debugMode = false;
        state.deepDebugMode = false;
        //state.lastOutput = state.lastOutput.replace(/<SYSTEM>[\s\S]*?<\/SYSTEM>/g, '').trim();
    } else if (lower.includes("/debug on")) {
        state.debugMode = true;
        state.deepDebugMode = false;
    } else if (lower.includes("/debug deep")) {
        state.debugMode = true;
        state.deepDebugMode = true;
    } else if (lower.includes("/debug simple")) {
        state.debugMode = true;
        state.deepDebugMode = false;
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

    // Optional: Store input to be available in {INPUT}
    state.lastInput = text;

    return {text};
}
modifier(text);
