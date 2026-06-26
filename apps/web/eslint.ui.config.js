import baseConfig from "./eslint.config.js";
import deSlopUi from "./.de-slop-ui/eslint.flat-config.mjs";

export default [...baseConfig, ...deSlopUi];
