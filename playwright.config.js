var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: true,
    reporter: "list",
    use: {
        baseURL: "http://127.0.0.1:4173",
        trace: "retain-on-failure",
    },
    webServer: {
        command: "npm run dev -- --host 127.0.0.1 --port 4173",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: true,
    },
    projects: [
        { name: "desktop", use: __assign(__assign({}, devices["Desktop Chrome"]), { viewport: { width: 1440, height: 900 } }) },
        { name: "mobile", use: __assign(__assign({}, devices["iPhone 13"]), { viewport: { width: 390, height: 844 } }) },
    ],
});
