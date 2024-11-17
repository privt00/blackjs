const http = require('http');
const fs = require('fs');
const path = require('path');
const execSync = require('child_process').execSync;

let routes = {};
let cssCache = {};
let lookDefinitionsPath = path.resolve(__dirname, 'bjs', 'looks.txt');
let bjsDefinitionsPath = path.resolve(__dirname, 'bjs', 'bjs.txt');

function setFilePaths(lookFilePath, bjsFilePath) {
    lookDefinitionsPath = lookFilePath;
    bjsDefinitionsPath = bjsFilePath;
}

function loadDefinitions() {
    const filePath = lookDefinitionsPath;
    
    if (!fs.existsSync(filePath)) {
        try {
            const modulePath = path.resolve(__dirname);
            const sourceFilePath = path.resolve(modulePath, 'bjs', path.basename(filePath));
            execSync(`cp "${sourceFilePath}" "${filePath}"`);
        } catch (err) {
            console.error(`Error cloning file looks.txt:`, err);
        }
    }
    
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        const definitions = {};
        data.split('\n').forEach(line => {
            const [key, value] = line.split('=').map(str => str.trim());
            if (key && value) {
                definitions[key] = value;
            }
        });
        return definitions;
    } catch (err) {
        console.error(`Error reading looks.txt:`, err);
        return {};
    }
}

function loadBjsDefinitions() {
    const filePath = bjsDefinitionsPath;
    
    if (!fs.existsSync(filePath)) {
        try {
            const modulePath = path.resolve(__dirname);
            const sourceFilePath = path.resolve(modulePath, 'bjs', path.basename(filePath));
            execSync(`cp "${sourceFilePath}" "${filePath}"`);
        } catch (err) {
            console.error(`Error cloning file bjs.txt:`, err);
        }
    }

    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        const definitions = {};
        data.split('\n').forEach(line => {
            const [key, value] = line.split('/uzbjs/').map(str => str.trim());
            if (key && value) {
                definitions[key] = value;
            }
        });
        return definitions;
    } catch (err) {
        console.error(`Error reading bjs.txt:`, err);
        return {};
    }
}

const bjsDefinitions = loadBjsDefinitions();
const lookDefinitions = loadDefinitions();

function generateRandomClassName() {
    return `cls_${Math.random().toString(36).substr(2, 8)}`;
}

function saveStylesToFile(styles) {
    const filePath = path.resolve('./styles.css');
    fs.writeFileSync(filePath, styles.join('\n'), 'utf-8');
}

function processContentOnce(content) {
    const styles = [];
    let scriptBlocks = [];

    const processedContent = content
        .replace(/<button\s+bjs="([^"]+)"(.*?)>/g, (match, bjsName, rest) => {
            const replacement = bjsDefinitions[bjsName] || '';
            return `<div${replacement}${rest}>`;
        })
        .replace(/bjs-action="([^"]+)"/g, (match, actionDefinition) => {
            const [actionName, targetId] = actionDefinition.split(':').map(str => str.trim());
            const scriptTemplate = bjsDefinitions[actionName];

            if (scriptTemplate) {
                const script = scriptTemplate.replace('TARGET_ID', `${targetId}`);
                scriptBlocks.push(`document.querySelectorAll('[bjs-action="${actionDefinition}"]').forEach(element => { ${script} });`);
            }

            return 'bjs-action="' + actionDefinition + '"';
        })
        .replace(/look="([^"]+)"/g, (match, lookName) => {
            const lookKeys = lookName.split(' ');
            const className = generateRandomClassName();

            const cssRules = lookKeys.map(key => lookDefinitions[key] || '').join(' ');
            cssCache[className] = cssRules;

            styles.push(`.${className} { ${cssRules} }`);
            return `class="${className}"`;
        });

    const finalScript = `
        <script>
            document.addEventListener('DOMContentLoaded', () => {
                ${scriptBlocks.join('\n')}
            });
        </script>
    `;

    return { processedContent: processedContent + finalScript, styles };
}

function initializeStylesAndCache() {
    const styles = [];
    for (const route in routes) {
        const content = fs.readFileSync(routes[route], 'utf-8');
        const { processedContent, styles: newStyles } = processContentOnce(content);

        routes[route] = { content: processedContent };
        styles.push(...newStyles);
    }

    saveStylesToFile(Object.entries(cssCache).map(([className, rules]) => `.${className} { ${rules} }`).concat(styles));
}

function handleRequest(req, res) {
    if (req.url === '/styles.css') {
        const cssPath = path.resolve('./styles.css');
        res.writeHead(200, { 'Content-Type': 'text/css' });
        return res.end(fs.readFileSync(cssPath, 'utf-8'));
    }

    const route = routes[req.url];
    if (!route) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404 Not Found');
    }

    const processedContent = route.content;
    const htmlWithStylesheet = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link rel="stylesheet" href="/styles.css">
            <title>Document</title>
        </head>
        <body>
            ${processedContent}
        </body>
        </html>
    `;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(htmlWithStylesheet);
}

function startServer(port) {
    initializeStylesAndCache();
    const server = http.createServer(handleRequest);
    server.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}

function addRoute(route, filePath) {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`File ${filePath} does not exist.`);
    }
    routes[route] = absolutePath;
    console.log(`Route added: ${route} -> ${absolutePath}`);
}

module.exports = {
    startServer,
    addRoute,
    setFilePaths
};
