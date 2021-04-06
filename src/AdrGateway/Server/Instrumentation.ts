function loadInstrumentation() {
//If Application Insights configured, start it
if (process.env.APPINSIGHTS_INSTRUMENTATIONKEY) {
    var applicationInsights = require("applicationinsights");
    applicationInsights.setup().start();
}
}

export { loadInstrumentation };