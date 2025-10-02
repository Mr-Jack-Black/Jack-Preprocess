// Example of simplifistic context-file
const modifier = (text) => {

  // Just add following line to support JackPreprocess
  // (+ copy everything from library.js to your library-file)
  text = JackPreprocess(text);
  
  // Store Context
  state.lastContext = text;
    
  return {text};
};
modifier(text);
