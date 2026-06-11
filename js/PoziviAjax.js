const PoziviAjax = (function () {
    const config = (typeof window !== "undefined" && window.PoziviAjaxConfig) ? window.PoziviAjaxConfig : {};
    const baseUrl = normalizeBase(config.baseUrl || "/api");
    const scenarioPath = normalizePath(config.scenarioPath || "scenarios");
    const linePath = normalizeSegment(config.linePath || "lines");
    const characterPath = normalizeSegment(config.characterPath || "characters");

    function normalizeBase(url) {
        return url ? url.replace(/\/+$/, "") : "";
    }

    function normalizePath(path) {
        if (!path) return "";
        const trimmed = path.replace(/\/+$/, "");
        return trimmed.startsWith("/") ? trimmed : "/" + trimmed;
    }

    function normalizeSegment(segment) {
        return segment ? segment.replace(/^\/+|\/+$/g, "") : "";
    }

    function scenarioBaseUrl() {
        return baseUrl + scenarioPath;
    }

    function scenarioUrl(scenarioId) {
        return scenarioBaseUrl() + "/" + encodeURIComponent(scenarioId);
    }

    function parseResponse(xhr) {
        const text = xhr.responseText;
        if (!text) return null;
        try {
            return JSON.parse(text);
        } catch (err) {
            return { message: text };
        }
    }

    function request(method, url, data, callback) {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        if (data !== null && data !== undefined) {
            xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        }
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            const response = parseResponse(xhr);
            if (typeof callback === "function") callback(xhr.status, response);
        };
        xhr.onerror = function () {
            if (typeof callback === "function") callback(xhr.status || 0, null);
        };
        xhr.send(data !== null && data !== undefined ? JSON.stringify(data) : null);
    }

    function postScenario(title, callback) {
        request("POST", scenarioBaseUrl(), { title: title }, callback);
    }

    function lockLine(scenarioId, lineId, userId, callback) {
        const url = scenarioUrl(scenarioId) + "/" + linePath + "/" + encodeURIComponent(lineId) + "/lock";
        request("POST", url, { userId: userId }, callback);
    }

    function updateLine(scenarioId, lineId, userId, newText, callback) {
        const url = scenarioUrl(scenarioId) + "/" + linePath + "/" + encodeURIComponent(lineId);
        request("PUT", url, { userId: userId, newText: newText }, callback);
    }

    function lockCharacter(scenarioId, characterName, userId, callback) {
        const url = scenarioUrl(scenarioId) + "/" + characterPath + "/lock";
        request("POST", url, { userId: userId, characterName: characterName }, callback);
    }

    function updateCharacter(scenarioId, userId, oldName, newName, callback) {
        const url = scenarioUrl(scenarioId) + "/" + characterPath + "/update";
        request("POST", url, { userId: userId, oldName: oldName, newName: newName }, callback);
    }

    function getDeltas(scenarioId, since, callback) {
        let url = scenarioUrl(scenarioId) + "/deltas";
        if (since !== undefined && since !== null) {
            url += "?since=" + encodeURIComponent(since);
        }
        request("GET", url, null, callback);
    }

    function getScenario(scenarioId, callback) {
        const url = scenarioUrl(scenarioId);
        request("GET", url, null, callback);
    }

    return {
        postScenario,
        lockLine,
        updateLine,
        lockCharacter,
        updateCharacter,
        getDeltas,
        getScenario
    };
})();

if (typeof window !== "undefined") window.PoziviAjax = PoziviAjax;
