let editor;                    // Monaco editor instance (input)
let outputEditor;              // Monaco editor instance (output)
let currentQuestion = 1;       // Current question number
let timeLeft = 2 * 60 * 60;    // 2 hours in seconds
let timerInterval;             // Timer interval reference
let examStarted = false;       // Exam status flag
let waitingForInput = false;   // Flag to track if waiting for user input
let inputQueue = [];           // Queue for input values
let currentInputPromise = null; // Promise for current input request

// Question tracking sets
let visitedQuestions = new Set();    // Questions user has seen
let answeredQuestions = new Set();   // Questions user has submitted
const totalQuestions = 12;           // Total number of questions

// ========================================
// QUESTIONS DATA
// ========================================

// Global variable to store loaded questions
let codingQuestions = [];

// Function to load questions from JSON file
async function loadQuestionsFromJSON() {
    try {
        const response = await fetch('Backend/all_questions.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const questions = await response.json();
        codingQuestions = questions;
        console.log(`Successfully loaded ${questions.length} questions from JSON file`);
        return questions;
    } catch (error) {
        console.error('Failed to load questions from JSON file:', error);
        console.log('Falling back to empty questions array');
        codingQuestions = [];
        return [];
    }
}

// ========================================
// MONACO EDITOR INITIALIZATION
// ========================================

// Configure Monaco Editor paths
require.config({
    paths: {
        vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs'
    }
});
// Add this function anywhere in your OnlineExam.js file
async function submitTestResults(results) {
    try {
        const response = await fetch("http://localhost:5000/api/test-results", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(results),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log("Test results submitted successfully:", data);
        alert('Exam completed! Your answers have been submitted.');

        // Redirect to Dashboard
        window.location.href = 'Dashboard.html';

    } catch (error) {
        console.error("Failed to submit test results:", error);
        alert('An error occurred while submitting your test results.');
    }
}

// Load and initialize Monaco Editor
require(['vs/editor/editor.main'], function () {

    // Create Monaco Editor with basic settings (input editor)
    editor = monaco.editor.create(document.getElementById('monaco-editor'), {
        value: localStorage.getItem('question_1_code') || languageTemplates.cpp, // Default C++ template
        language: 'cpp',            // Set language to C++
        theme: 'vs-dark',                  // Dark theme
        fontSize: 14,                      // Font size
        minimap: { enabled: false },       // Disable minimap
        scrollBeyondLastLine: false,       // Don't scroll beyond last line
        automaticLayout: true,             // Auto-resize
        wordWrap: 'on',                    // Enable word wrap
        lineNumbers: 'on',                 // Show line numbers
        readOnly: false,                   // Allow editing
        cursorStyle: 'line',               // Line cursor style
        renderWhitespace: 'selection',     // Show whitespace in selection
        selectOnLineNumbers: true,         // Select line on line number click
        roundedSelection: false,           // Square selection
        scrollbar: {
            vertical: 'visible',
            horizontal: 'visible',
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10
        }
    });

    // Create Monaco Editor for output terminal
    outputEditor = monaco.editor.create(document.getElementById('output-content'), {
        value: 'Click "Run Code" to execute your program...\nUse Ctrl+Enter as a shortcut to run code',
        language: 'plaintext',
        theme: 'vs-dark',
        fontSize: 14,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        wordWrap: 'on',
        lineNumbers: 'off',
        readOnly: true,
        cursorStyle: 'line',
        renderWhitespace: 'none',
        selectOnLineNumbers: false,
        roundedSelection: false,
        scrollbar: {
            vertical: 'visible',
            horizontal: 'visible',
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10
        }
    });

    // Auto-save code every 2 seconds when user types
    editor.onDidChangeModelContent(function () {
        clearTimeout(window.autoSaveTimeout);
        window.autoSaveTimeout = setTimeout(function () {
            saveCode();
        }, 2000);
    });
    
    // Auto-save output when it changes
    outputEditor.onDidChangeModelContent(function () {
        clearTimeout(window.outputAutoSaveTimeout);
        window.outputAutoSaveTimeout = setTimeout(function () {
            saveOutput();
        }, 2000);
    });

    // Add keyboard shortcut for running code (Ctrl+Enter)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, function () {
        runCode();
    });

    // Handle input in output editor when waiting for input
    outputEditor.onKeyDown(function (e) {
        if (waitingForInput && e.keyCode === monaco.KeyCode.Enter) {
            e.preventDefault();
            handleInputSubmission();
        }
    });

    // Set initial language button state - C++ as default
    const cppBtn = document.getElementById('btn-cpp');
    if (cppBtn) {
        cppBtn.style.backgroundColor = 'rgb(0, 73, 183)';
    }
    
    // Set C++ as default language
    currentLanguage = 'cpp';

    // Exam will start when user clicks the start button
});

// ========================================
// TIMER FUNCTIONS
// ========================================

// Update timer display every second
function updateTimer() {
    // Calculate hours, minutes, seconds
    const hours = Math.floor(timeLeft / 3600);
    const minutes = Math.floor((timeLeft % 3600) / 60);
    const seconds = timeLeft % 60;

    // Format time as HH:MM:SS
    const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // Update timer display
    const timeElement = document.getElementById('time');
    timeElement.textContent = timeString;

    // Check if time is up
    if (timeLeft <= 0) {
        finishExam();
    } else {
        timeLeft--; // Decrease time by 1 second
    }
}

// Start the exam and timer
function startExam() {
    examStarted = true;
    console.log("Exam started - tab switch detection is now active");
    resetTabSwitchDetection(); // Reset tab switch detection
    timerInterval = setInterval(updateTimer, 1000); // Update every second
    updateTimer(); // Update immediately

    // Clear all saved code and output for all questions when starting new exam
    for (let i = 1; i <= codingQuestions.length; i++) {
        localStorage.removeItem(`question_${i}_code`);
        localStorage.removeItem(`question_${i}_output`);
    }

    // Clear output terminal
    if (outputEditor) {
        outputEditor.setValue('Click "Run Code" to execute your program...\nUse Ctrl+Enter as a shortcut to run code');
    }

    // Set default language template in Monaco editor
    if (editor) {
        editor.setValue(languageTemplates[currentLanguage]);
        // Ensure proper language highlighting
        monaco.editor.setModelLanguage(editor.getModel(), languageMap[currentLanguage]);
    }
}

// ========================================
// CODE SAVE/LOAD FUNCTIONS
// ========================================

// Save current code to browser storage
function saveCode() {
    if (editor) {
        const code = editor.getValue();
        localStorage.setItem(`question_${currentQuestion}_code`, code);
        console.log(`Auto-saved code for question ${currentQuestion}`);
    }
}

// Save output for current question
function saveOutput() {
    if (outputEditor) {
        const output = outputEditor.getValue();
        localStorage.setItem(`question_${currentQuestion}_output`, output);
        console.log(`Auto-saved output for question ${currentQuestion}`);
    }
}

// Load output for a specific question
function loadOutput(questionId) {
    const savedOutput = localStorage.getItem(`question_${questionId}_output`);
    if (outputEditor) {
        if (savedOutput) {
            outputEditor.setValue(savedOutput);
        } else {
            // Load default placeholder
            outputEditor.setValue('Click "Run Code" to execute your program...\nUse Ctrl+Enter as a shortcut to run code');
        }
    }
}

// Load code for a specific question
function loadCode(questionId) {
    const savedCode = localStorage.getItem(`question_${questionId}_code`);
    if (editor) {
        if (savedCode && savedCode !== '// WRITE YOUR CODE HERE') {
            editor.setValue(savedCode);
        } else {
            // Load C++ template as default for new questions
            editor.setValue(languageTemplates['cpp']);
        }
    }
    
    // Also load the saved output
    loadOutput(questionId);
}

// ========================================
// QUESTION NAVIGATION FUNCTIONS
// ========================================

// Go to a specific question number
function goToQuestion(questionId) {
    // Check if question number is valid
    if (questionId >= 1 && questionId <= codingQuestions.length) {
        // Auto-save current question's code and output
        saveCode();
        saveOutput();
        
        visitedQuestions.add(questionId);
        currentQuestion = questionId;

        // Get question from the loaded JSON data
        const question = codingQuestions[questionId - 1];

        const questionContentDiv = document.querySelector('.question-content');
        if (questionContentDiv && question) {
            // Format test cases as a list
            const testCasesHTML = question.testCases.map((testCase, index) => 
                `<li><strong>Test Case ${index + 1}:</strong> Input: <code>${testCase.input}</code> → Expected Output: <code>${testCase.expectedOutput}</code></li>`
            ).join('');

            questionContentDiv.innerHTML = `
                <h1>${question.questionNumber}</h1>
                <h3>${question.title}</h3>
                <span>${question.description}</span>
                <div class="question-details">
                    <div class="question-info">
                        <p><strong>Difficulty:</strong> ${question.difficulty}</p>
                        <p><strong>Topic:</strong> ${question.topic}</p>
                    </div>
                    <h5>Test Cases:</h5>
                    <ul class="test-cases">
                        ${testCasesHTML}
                    </ul>
                </div>
            `;
        }

        // Load saved code for the new question or use C++ template as default
        loadCode(questionId);
        
        // Set C++ as default language for every question
        currentLanguage = 'cpp';
        monaco.editor.setModelLanguage(editor.getModel(), languageMap['cpp']);
        
        // Update button styles to show C++ as active
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.style.backgroundColor = 'rgb(11, 107, 252)';
        });
        
        const cppBtn = document.getElementById('btn-cpp');
        if (cppBtn) {
            cppBtn.style.backgroundColor = 'rgb(0, 73, 183)';
        }
        
        updateQuestionNavigation(questionId);
        updateStatusCounters();
    }
}
// Update question navigation circle colors
function updateQuestionNavigation(activeQuestion) {
    const circles = document.querySelectorAll('.circle');

    circles.forEach((circle, index) => {
        const questionId = index + 1;

        // Remove all status classes
        circle.classList.remove('active', 'answered', 'visited');

        // Add appropriate status class based on question state
        if (answeredQuestions.has(questionId)) {
            circle.classList.add('answered');        // Green - answered
        } else if (visitedQuestions.has(questionId)) {
            circle.classList.add('visited');         // Red - visited but not answered
        }

        // Add active class for current question
        if (questionId === activeQuestion) {
            circle.classList.add('active');          // Blue - current question
        }
    });
}

// Update the status counter numbers
function updateStatusCounters() {
    const answeredCount = answeredQuestions.size;                    // Questions submitted
    const visitedCount = visitedQuestions.size - answeredQuestions.size;  // Visited but not answered
    const notVisitedCount = codingQuestions.length - visitedQuestions.size;       // Not seen yet

    // Update display
    document.getElementById('answeredCount').textContent = answeredCount;
    document.getElementById('visitedCount').textContent = visitedCount;
    document.getElementById('notVisitedCount').textContent = notVisitedCount;
}

// Go to next question
function nextQuestion() {
    if (currentQuestion < codingQuestions.length) {
        goToQuestion(currentQuestion + 1);
    } else {
        alert('This is the last question.');
    }
}

// Submit current question answer
function submitAnswer() {
    if (editor) {
        const code = editor.getValue();
        console.log(`Submitting answer for question ${currentQuestion}:`, code);

        // Mark current question as answered
        answeredQuestions.add(currentQuestion);

        // Update circle color to green (answered)
        const circles = document.querySelectorAll('.circle');
        if (circles[currentQuestion - 1]) {
            circles[currentQuestion - 1].classList.add('answered');
        }

        // Update status counters
        updateStatusCounters();

        // Automatically go to next question after submission
        if (currentQuestion < codingQuestions.length) {
            goToQuestion(currentQuestion + 1);
        }
    }
}

// ========================================
// EXAM CONTROL FUNCTIONS
// ========================================

// Replace your existing finishExam() function with this one
function finishExam(skipConfirmation = false) {
    if (skipConfirmation || confirm('Are you sure you want to finish the exam? This action cannot be undone.')) {
        // Stop the timer and monitoring
        clearInterval(timerInterval);
        examStarted = false;
        stopFocusMonitoring();
        stopActivityMonitoring();

        // Save current code
        saveCode();

        // START OF THE SECTION TO REPLACE
        // ** Calculate final results here **
        const totalQuestions = codingQuestions.length; // Dynamically get from loaded questions array
        const solvedQuestionsCount = answeredQuestions.size;
        const unsolvedQuestionsCount = totalQuestions - solvedQuestionsCount;

        // Note: You need a way to determine correct/wrong answers.
        // This is a placeholder. You will need to implement a grading logic.
        const correctAnswersCount = 0; // Placeholder
        const wrongAnswersCount = 0;   // Placeholder
        const totalScore = 0;          // Placeholder

        // Placeholder for questions analysis
        const questionsAnalysis = Array.from(answeredQuestions).map(qId => ({
            questionId: qId,
            status: 'Unsolved' // This is a placeholder, update with actual logic
        }));
        // END OF THE SECTION TO REPLACE

        // Fetch candidate details from localStorage or a global variable if available
        const candidateEmail = localStorage.getItem('userEmail'); // Or however you store it
        const registrationId = localStorage.getItem('registrationId'); // From registration success

        if (!candidateEmail || !registrationId) {
            alert("Could not find user information. Cannot submit results.");
            window.location.href = 'Dashboard.html';
            return;
        }

        const results = {
            registrationId: registrationId,
            candidateEmail: candidateEmail,
            examName: 'Your Exam Name Here', // e.g., 'Python & SQL Fundamentals'
            status: 'Completed',
            totalScore: totalScore,
            correctAnswers: correctAnswersCount,
            wrongAnswers: wrongAnswersCount,
            unsolvedQuestions: unsolvedQuestionsCount,
            questionsAnalysis: questionsAnalysis,
        };

        // Call the new function to send results to the server
        submitTestResults(results);

        // Make editor read-only after submission
        if (editor) {
            editor.updateOptions({ readOnly: true });
        }
    }
}

// Warn user if they try to leave during exam (handled in tab switch detection section)

// ========================================
// INITIALIZATION
// ========================================

// Set up first question when page loads
document.addEventListener('DOMContentLoaded', async function () {
    // Load questions from JSON file first
    await loadQuestionsFromJSON();
    
    // Update total questions count based on loaded questions
    if (codingQuestions.length > 0) {
        // Update the totalQuestions variable to match loaded questions
        const totalQuestionsElement = document.getElementById('notVisitedCount');
        if (totalQuestionsElement) {
            totalQuestionsElement.textContent = codingQuestions.length;
        }
    }
    
    // Mark first question as visited
    visitedQuestions.add(1);
    updateQuestionNavigation(1);
    updateStatusCounters();

    // Now correctly load and display the first question
    goToQuestion(1);
});
// ========================================
// ENHANCED CODE EXECUTION FUNCTIONS
// ========================================

// Current programming language
let currentLanguage = 'cpp';

// Language-specific code templates with comprehensive syntax
const languageTemplates = {
    python: `//Write your Python code here
def main():

`, 
    
    cpp: `// Write your C++ code here
#include <iostream>
#include <string>
using namespace std;

int main() {

    return 0;
}`,
    
    java: `// Write your Java code here
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {

    }
}`,
    
    html: `// Write your HTML code here
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title></title>
</head>
<body>
   
</body>
</html>
`
};

// Language-specific Monaco editor language IDs
const languageMap = {
    python: 'python',
    cpp: 'cpp',
    java: 'java',
    html: 'html'
};

// Change programming language
function changeLanguage(lang) {
    if (!editor) return;
    
    // Save current code before changing language
    saveCode();
    
    currentLanguage = lang;
    
    // Update Monaco editor language
    monaco.editor.setModelLanguage(editor.getModel(), languageMap[lang]);
    
    // Update button styles
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.style.backgroundColor = 'rgb(11, 107, 252)';
    });
    
    const activeBtn = document.getElementById(`btn-${lang}`);
    if (activeBtn) {
        activeBtn.style.backgroundColor = 'rgb(0, 73, 183)';
    }
    
    // Always load the template for the selected language
        editor.setValue(languageTemplates[lang]);
    
    console.log(`Language changed to: ${lang}`);
}

// Enhanced code execution with language-specific compilation
async function runCode() {
    if (!editor) return;

    const code = editor.getValue();
    const runBtn = document.querySelector('.run-btn');

    // Clear previous output
    clearOutput();

    // Show running state
    if (runBtn) {
        runBtn.textContent = '⏳ Running...';
        runBtn.disabled = true;
        runBtn.style.backgroundColor = '#6c757d';
    }

    // Add timestamp
    const timestamp = new Date().toLocaleTimeString();
    addOutputLine(`[${timestamp}] Compiling and executing ${currentLanguage.toUpperCase()} code...`, 'info');

    // Simulate compilation delay for better UX
    setTimeout(async () => {
        try {
            switch (currentLanguage) {
                case 'python':
                    await executePython(code);
                    break;
                case 'cpp':
                    await executeCpp(code);
                    break;
                case 'java':
                    await executeJava(code);
                    break;
                case 'html':
                    await executeHtml(code);
                    break;
                default:
                    await executeCpp(code);
            }
        } catch (error) {
            addOutputLine(`Compilation Error: ${error.message}`, 'error');
            addOutputLine(`Stack trace: ${error.stack}`, 'error');
        }

        addOutputLine('--- Execution completed ---', 'info');

        // Restore button state
        if (runBtn) {
            runBtn.textContent = '▶ Run Code';
            runBtn.disabled = false;
            runBtn.style.backgroundColor = '#007acc';
        }
    }, 500); // 500ms delay for better UX
}



// Execute Python code (simulated)
async function executePython(code) {
    addOutputLine('Python execution (simulated):', 'info');
    
    // Check for input statements
    const hasInput = hasInputStatements(code, 'python');
    if (hasInput) {
        addOutputLine('Interactive input detected - program will request user input', 'info');
    }
    
    // Simple Python code simulation
    const lines = code.split('\n');
    let output = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.startsWith('print(') && line.endsWith(')')) {
            const content = line.substring(6, line.length - 1);
            output.push(content.replace(/['"]/g, ''));
        } else if (line.includes('input(')) {
            // Handle input statements
            const input = await requestInput('Enter value for input(): ');
            addOutputLine(`Input received: ${input}`, 'input');
        } else if (line.includes('=') && !line.includes('==')) {
            // Variable assignment
            const parts = line.split('=');
            const varName = parts[0].trim();
            const value = parts[1].trim();
            addOutputLine(`Variable ${varName} assigned: ${value}`, 'info');
        } else if (line.startsWith('if ') || line.startsWith('for ') || line.startsWith('while ') || line.startsWith('def ')) {
            addOutputLine(`Control structure: ${line}`, 'info');
        } else if (line && !line.startsWith('#')) {
            addOutputLine(`Executing: ${line}`, 'info');
        }
    }
    
    if (output.length > 0) {
        output.forEach(line => addOutputLine(line, 'success'));
    } else {
        addOutputLine('Python code parsed successfully. No print statements found.', 'info');
    }
}

// Execute C++ code (simulated)
async function executeCpp(code) {
    addOutputLine('C++ compilation and execution (simulated):', 'info');
    
    // Check for basic C++ structure
    if (!code.includes('#include')) {
        addOutputLine('Warning: Missing #include directive', 'info');
    }
    
    if (!code.includes('int main()')) {
        addOutputLine('Warning: Missing main() function', 'info');
    }
    
    // Check for input statements
    const hasInput = hasInputStatements(code, 'cpp');
    if (hasInput) {
        addOutputLine('Interactive input detected - program will request user input', 'info');
    }
    
    // Extract cout statements
    const coutMatches = code.match(/cout\s*<<\s*[^;]+;/g);
    if (coutMatches) {
        for (const match of coutMatches) {
            const content = match.replace(/cout\s*<<\s*/, '').replace(/;.*$/, '');
            addOutputLine(`Output: ${content.replace(/['"]/g, '')}`, 'success');
        }
    }
    
    // Extract printf statements
    const printfMatches = code.match(/printf\s*\([^)]+\);/g);
    if (printfMatches) {
        for (const match of printfMatches) {
            const content = match.replace(/printf\s*\(/, '').replace(/\);.*$/, '');
            addOutputLine(`Output: ${content.replace(/['"]/g, '')}`, 'success');
        }
    }
    
    // Handle input statements
    if (hasInput) {
        const scanfMatches = code.match(/scanf\s*\([^)]+\);/g);
        const cinMatches = code.match(/cin\s*>>\s*[^;]+;/g);
        
        if (scanfMatches) {
            for (const match of scanfMatches) {
                const input = await requestInput('Enter value for scanf: ');
                addOutputLine(`Input received: ${input}`, 'input');
            }
        }
        
        if (cinMatches) {
            for (const match of cinMatches) {
                const input = await requestInput('Enter value for cin: ');
                addOutputLine(`Input received: ${input}`, 'input');
            }
        }
    }
    
    if (!coutMatches && !printfMatches) {
        addOutputLine('C++ code compiled successfully. No output statements found.', 'info');
    }
}

async function executeJava(code) {
    addOutputLine('Java compilation and execution (simulated):', 'info');
    
    // Check for basic Java structure
    if (!code.includes('public class')) {
        addOutputLine('Warning: Missing public class declaration', 'info');
    }
    
    if (!code.includes('public static void main')) {
        addOutputLine('Warning: Missing main method', 'info');
    }
    
    // Check for input statements
    const hasInput = hasInputStatements(code, 'java');
    if (hasInput) {
        addOutputLine('Interactive input detected - program will request user input', 'info');
    }
    
    // Extract System.out.println statements
    const printlnMatches = code.match(/System\.out\.println\s*\([^)]+\);/g);
    if (printlnMatches) {
        for (const match of printlnMatches) {
            const content = match.replace(/System\.out\.println\s*\(/, '').replace(/\);.*$/, '');
            addOutputLine(`Output: ${content.replace(/['"]/g, '')}`, 'success');
        }
    }
    
    // Extract System.out.print statements
    const printMatches = code.match(/System\.out\.print\s*\([^)]+\);/g);
    if (printMatches) {
        for (const match of printMatches) {
            const content = match.replace(/System\.out\.print\s*\(/, '').replace(/\);.*$/, '');
            addOutputLine(`Output: ${content.replace(/['"]/g, '')}`, 'success');
        }
    }
    
    // Handle input statements
    if (hasInput) {
        const scannerMatches = code.match(/(scanner\.next|scanner\.nextLine|scanner\.nextInt|scanner\.nextDouble|scanner\.nextFloat|scanner\.nextLong|scanner\.nextShort|scanner\.nextByte|scanner\.nextBoolean)\s*\([^)]*\);/g);
        
        if (scannerMatches) {
            for (const match of scannerMatches) {
                const input = await requestInput(`Enter value for ${match}: `);
                addOutputLine(`Input received: ${input}`, 'input');
            }
        }
    }
    
    if (!printlnMatches && !printMatches) {
        addOutputLine('Java code compiled successfully. No output statements found.', 'info');
    }
}

async function executeHtml(code) {
    addOutputLine('HTML rendering (simulated):', 'info');
    
    // Check for input statements
    const hasInput = hasInputStatements(code, 'html');
    if (hasInput) {
        addOutputLine('Interactive input detected - program will request user input', 'info');
    }
    
    // Handle prompt statements
    if (hasInput) {
        const promptMatches = code.match(/prompt\s*\([^)]*\)/g);
        if (promptMatches) {
            for (const match of promptMatches) {
                const input = await requestInput('Enter value for prompt(): ');
                addOutputLine(`Input received: ${input}`, 'input');
            }
        }
    }
    
    // Create a temporary iframe to render HTML
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '300px';
    iframe.style.border = '1px solid #ccc';
    iframe.style.borderRadius = '4px';
    iframe.style.marginTop = '10px';
    
    // Add iframe to output
    if (outputEditor) {
        const outputContainer = outputEditor.getContainerDomNode();
        outputContainer.appendChild(iframe);
    }
    
    // Write HTML content to iframe
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(code);
    iframeDoc.close();
    
    addOutputLine('HTML rendered successfully in preview window above.', 'success');
}

// Enhanced clear output function
function clearOutput() {
    const clearBtn = document.querySelector('.clear-btn');
    
    // Show clearing state
    if (clearBtn) {
        clearBtn.textContent = '🗑️ Clearing...';
        clearBtn.disabled = true;
        clearBtn.style.backgroundColor = '#6c757d';
    }
    
    // Clear with a small delay for better UX
    setTimeout(() => {
        if (outputEditor) {
            outputEditor.setValue('Click "Run Code" to execute your program...\nUse Ctrl+Enter as a shortcut to run code');
        }
        
        // Restore button state
        if (clearBtn) {
            clearBtn.textContent = '🗑️ Clear';
            clearBtn.disabled = false;
            clearBtn.style.backgroundColor = '#d73a49';
        }
    }, 200);
}

// Enhanced add output line function
function addOutputLine(text, type = 'success') {
    if (!outputEditor) return;
    
    const currentValue = outputEditor.getValue();
    const newValue = currentValue + '\n' + text;
    outputEditor.setValue(newValue);
    
    // Auto-scroll to bottom
    outputEditor.revealLineInCenter(outputEditor.getModel().getLineCount());
}

// ========================================
// INTERACTIVE INPUT FUNCTIONS
// ========================================

// Check if code contains input statements
function hasInputStatements(code, language) {
    const inputPatterns = {
        cpp: /(scanf\s*\(|cin\s*>>)/,
        java: /(new\s+Scanner\s*\(|scanner\.next|scanner\.nextLine)/,
        python: /input\s*\(/,
        html: /prompt\s*\(/
    };
    
    return inputPatterns[language] && inputPatterns[language].test(code);
}

// Request user input
function requestInput(prompt = 'Enter input: ') {
    return new Promise((resolve) => {
        waitingForInput = true;
        currentInputPromise = resolve;
        
        // Add prompt to output
        addOutputLine(prompt, 'info');
        
        // Make output editor editable and focus it
        outputEditor.updateOptions({ readOnly: false });
        outputEditor.focus();
        
        // Move cursor to end
        const model = outputEditor.getModel();
        const lastLine = model.getLineCount();
        const lastLineLength = model.getLineLength(lastLine);
        outputEditor.setPosition({ lineNumber: lastLine, column: lastLineLength + 1 });
    });
}

// Handle input submission
function handleInputSubmission() {
    if (!waitingForInput || !currentInputPromise) return;
    
    const model = outputEditor.getModel();
    const lastLine = model.getLineCount();
    const inputValue = model.getLineContent(lastLine).replace(/^.*:\s*/, ''); // Remove prompt prefix
    
    // Add the input value to output
    addOutputLine(inputValue, 'input');
    
    // Make output editor read-only again
    outputEditor.updateOptions({ readOnly: true });
    
    // Resolve the promise with the input value
    currentInputPromise(inputValue);
    currentInputPromise = null;
    waitingForInput = false;
    
    // Focus back to input editor
    editor.focus();
}

// Function to clear the Monaco editor
function clearMonacoEditor() {
    if (editor) {
        editor.setValue(''); // or '// WRITE YOUR CODE HERE' if you want a default comment
    }
}
document.addEventListener('DOMContentLoaded', function () {
    const clearBtn = document.getElementById('clear-editor-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearMonacoEditor);
    }
});

// Clear questions 11 and 12 content
localStorage.removeItem('question_11_code');
localStorage.removeItem('question_12_code');

// ===============================
// FULLSCREEN FUNCTIONALITY
// ===============================
function openFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen();
    }
}

// Show modal and require user gesture to enter fullscreen
document.addEventListener('DOMContentLoaded', function () {
    const modal = document.getElementById('fullscreen-modal');
    const btn = document.getElementById('start-fullscreen-btn');
    btn.addEventListener('click', function () {
        openFullscreen();
        modal.style.display = 'none';
        // Start the exam when user clicks start button
        startExam();
        // Automatically show question 1 when exam starts
        goToQuestion(1);
    });
    
    const question = questions.find(q => q.id === 1) || {
        id: 1,
        title: "Question 1",
        description: "Write a function to find the maximum element in an array."
    };
    
    // Update question display in sidebar immediately
    const questionElement = document.getElementById('Q1');
    if (questionElement) {
        questionElement.innerHTML = `<b>${question.title}</b><br><small>${question.description}</small>`;
    }
});

// Store original heights and button positions
let originalMonacoHeight = 755;
let originalOutputHeight = 755;
let originalNextBtnBottom = null;
let originalSubBtnBottom = null;

// Adjust Monaco editor and output terminal height on fullscreen
function adjustEditorHeightOnFullscreen() {
    const monacoDiv = document.getElementById('monaco-editor');
    const outputDiv = document.getElementById('output-terminal');
    const nextBtn = document.querySelector('.Nextbtn');
    const subBtn = document.querySelector('.Subbtn');

    if (monacoDiv && outputDiv) {
        // Store original height if not already stored
        if (!originalMonacoHeight) {
            originalMonacoHeight = parseInt(monacoDiv.style.height, 10) || 755;
            originalOutputHeight = parseInt(outputDiv.style.height, 10) || 755;
        }

        // Increase height by 100px
        const newHeight = originalMonacoHeight + 100;
        monacoDiv.style.height = newHeight + 'px';
        outputDiv.style.height = newHeight + 'px';
    }

    // Change button bottom position to 56px
    if (nextBtn && subBtn) {
        // Store original bottom positions if not already stored
        if (originalNextBtnBottom === null) {
            originalNextBtnBottom = nextBtn.style.bottom || '28px';
            originalSubBtnBottom = subBtn.style.bottom || '28px';
        }

        // Set bottom to 56px
        nextBtn.style.bottom = '56px';
        subBtn.style.bottom = '56px';
    }
}

// Restore original heights and button positions when exiting fullscreen
function restoreOriginalHeights() {
    const monacoDiv = document.getElementById('monaco-editor');
    const outputDiv = document.getElementById('output-terminal');
    const nextBtn = document.querySelector('.Nextbtn');
    const subBtn = document.querySelector('.Subbtn');

    if (monacoDiv && outputDiv) {
        monacoDiv.style.height = originalMonacoHeight + 'px';
        outputDiv.style.height = originalOutputHeight + 'px';
    }

    // Restore button bottom positions to 22px
    if (nextBtn && subBtn && originalNextBtnBottom !== null) {
        nextBtn.style.bottom = '28px';
        subBtn.style.bottom = '28px';
    }
}

document.addEventListener('fullscreenchange', function () {
    if (document.fullscreenElement) {
        adjustEditorHeightOnFullscreen();
    } else {
        restoreOriginalHeights();
    }
});


// // ========================================
// // SECURITY MEASURES
// // ========================================

// // Prevent screenshots, developer tools, and right-click
// document.addEventListener("keydown", function (e) {
//     // Detect PrintScreen
//     if (e.key === "PrintScreen") {
//         alert("Screenshot is disabled!");
//         navigator.clipboard.writeText(" "); // Clears copied screenshot
//     }

//     // Block common dev tools shortcuts
//     if (
//         (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "i") || // Ctrl+Shift+I
//         (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "j") || // Ctrl+Shift+J
//         (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "c") || // Ctrl+Shift+C
//         (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "p") || // Ctrl+Shift+P
//         (e.ctrlKey && e.key.toLowerCase() === "u") || 
//         (e.ctrlKey && e.key.toLowerCase() === "f") || 
//         (e.ctrlKey && e.key.toLowerCase() === "v") || 
//         (e.ctrlKey && e.key.toLowerCase() === "c") || 
//         e.key === "Fn" ||
//         e.key === "Tab" ||
//         e.key === "Escape" ||
//         e.key === "Alt" ||
//         e.key === "Ctrl" ||
//         e.key === "F12" ||
//         e.key === "F11" ||
//         e.key === "F10" ||
//         e.key === "F9" ||
//         e.key === "F8" ||
//         e.key === "F7" ||
//         e.key === "F6" ||
//         e.key === "F5" ||
//         e.key === "F4" ||
//         e.key === "F3" ||
//         e.key === "F2" ||
//         e.key === "F1"
//     ) {
//         e.preventDefault();
//         alert("Developer tools are disabled!");
//     }
// });

// // Block right-click
// document.addEventListener("contextmenu", (e) => {
//     e.preventDefault();
//     alert("Right-click is disabled!");
// });

// // ===============================
// // TAB SWITCH DETECTION
// // ===============================
// let tabSwitchDetected = false;
// let lastFocusTime = Date.now();
// let focusCheckInterval;

// // Primary tab switch detection using visibilitychange
// document.addEventListener("visibilitychange", () => {
//     console.log("Visibility changed - hidden:", document.hidden, "state:", document.visibilityState, "examStarted:", examStarted, "tabSwitchDetected:", tabSwitchDetected);

//     // Immediate detection when tab becomes hidden
//     if (document.hidden && examStarted && !tabSwitchDetected) {
//         console.log("Tab switch detected - terminating exam");
//         tabSwitchDetected = true;
//         alert("Tab switch detected. Your session will be terminated.");
//         finishExam(true); // Skip confirmation dialog
//         return;
//     }

//     // Additional check for when visibility state changes to 'hidden'
//     if (document.visibilityState === 'hidden' && examStarted && !tabSwitchDetected) {
//         console.log("Visibility state hidden detected - terminating exam");
//         tabSwitchDetected = true;
//         alert("Tab switch detected. Your session will be terminated.");
//         finishExam(true);
//     }
// });

// // Additional tab switch detection using pagehide event
// window.addEventListener("pagehide", (event) => {
//     if (examStarted && !tabSwitchDetected) {
//         console.log("Page hide detected - terminating exam");
//         tabSwitchDetected = true;
//         finishExam(true);
//     }
// });

// // Prevent tab switching using beforeunload
// window.addEventListener("beforeunload", function (e) {
//     if (examStarted) {
//         saveCode(); // Save before leaving
//         e.preventDefault();
//         e.returnValue = 'Your exam is still in progress. Are you sure you want to leave?';
//         return 'Your exam is still in progress. Are you sure you want to leave?';
//     }
// });

// // Enhanced detection for window blur and focus
// window.addEventListener("blur", () => {
//     if (examStarted && !tabSwitchDetected) {
//         console.log("Window blur detected - starting focus monitoring");
//         startFocusMonitoring();
//     }
// });

// window.addEventListener("focus", () => {
//     if (examStarted) {
//         console.log("Window focus detected");
//         lastFocusTime = Date.now();
//         stopFocusMonitoring();
//     }
// });

// // Monitor focus changes more aggressively
// function startFocusMonitoring() {
//     if (focusCheckInterval) {
//         clearInterval(focusCheckInterval);
//     }

//     focusCheckInterval = setInterval(() => {
//         if (examStarted && !tabSwitchDetected) {
//             const currentTime = Date.now();
//             const timeSinceLastFocus = currentTime - lastFocusTime;

//             // If more than 2 seconds have passed since last focus, consider it a tab switch
//             if (timeSinceLastFocus > 2000 && !document.hasFocus()) {
//                 console.log("Focus monitoring detected tab switch - terminating exam");
//                 tabSwitchDetected = true;
//                 clearInterval(focusCheckInterval);
//                 alert("Tab switch detected. Your session will be terminated.");
//                 finishExam(true);
//             }
//         }
//     }, 500); // Check every 500ms
// }

// function stopFocusMonitoring() {
//     if (focusCheckInterval) {
//         clearInterval(focusCheckInterval);
//         focusCheckInterval = null;
//     }
// }

// // Additional detection using document focus events
// document.addEventListener("focusin", () => {
//     if (examStarted) {
//         lastFocusTime = Date.now();
//         console.log("Document focus in detected");
//     }
// });

// document.addEventListener("focusout", () => {
//     if (examStarted && !tabSwitchDetected) {
//         console.log("Document focus out detected - starting monitoring");
//         startFocusMonitoring();
//     }
// });

// // Mouse leave detection (when mouse leaves the window)
// document.addEventListener("mouseleave", () => {
//     if (examStarted && !tabSwitchDetected) {
//         console.log("Mouse leave detected - starting monitoring");
//         startFocusMonitoring();
//     }
// });

// // Reset tab switch detection when exam starts
// function resetTabSwitchDetection() {
//     tabSwitchDetected = false;
//     lastFocusTime = Date.now();
//     stopFocusMonitoring();
//     startActivityMonitoring();
// }

// // Monitor user activity to detect tab switches
// let lastActivityTime = Date.now();
// let activityCheckInterval;

// function startActivityMonitoring() {
//     if (activityCheckInterval) {
//         clearInterval(activityCheckInterval);
//     }

//     // Reset activity time
//     lastActivityTime = Date.now();

//     // Monitor for user activity
//     const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'click', 'touchstart'];
//     activityEvents.forEach(eventType => {
//         document.addEventListener(eventType, () => {
//             if (examStarted) {
//                 lastActivityTime = Date.now();
//             }
//         }, { passive: true });
//     });

//     // Check for inactivity and document state every second
//     activityCheckInterval = setInterval(() => {
//         if (examStarted && !tabSwitchDetected) {
//             const currentTime = Date.now();
//             const timeSinceLastActivity = currentTime - lastActivityTime;

//             // Check if document is hidden or not focused
//             if (document.hidden || !document.hasFocus()) {
//                 console.log("Periodic check detected tab switch - hidden:", document.hidden, "focused:", document.hasFocus());
//                 tabSwitchDetected = true;
//                 clearInterval(activityCheckInterval);
//                 alert("Tab switch detected. Your session will be terminated.");
//                 finishExam(true);
//                 return;
//             }

//             // If no activity for more than 3 seconds and page is not focused, consider it a tab switch
//             if (timeSinceLastActivity > 3000 && !document.hasFocus() && document.hidden) {
//                 console.log("Activity monitoring detected tab switch - terminating exam");
//                 tabSwitchDetected = true;
//                 clearInterval(activityCheckInterval);
//                 alert("Tab switch detected. Your session will be terminated.");
//                 finishExam(true);
//             }
//         }
//     }, 1000);
// }

// function stopActivityMonitoring() {
//     if (activityCheckInterval) {
//         clearInterval(activityCheckInterval);
//         activityCheckInterval = null;
//     }
// }
