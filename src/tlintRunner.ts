import * as vscode from 'vscode';
import * as cp from 'child_process';
import { LintedFiles } from './lintedFiles';

const outputChannel = vscode.window.createOutputChannel('Tlint');
const spinnerLabel = "$(sync~spin) Tlint:";

LintedFiles.initialize(outputChannel);

export function runTlint(spinner: vscode.StatusBarItem, doc: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection, config: vscode.WorkspaceConfiguration, trigger: String | null = null) {
    const currentTime = Date.now();
    const fileName = doc.fileName;

    // Use LintedFiles class to manage file tracking
    if (LintedFiles.shouldSkipAnalysis(fileName, currentTime, trigger)) {
        return;
    }

    // Update tracking in LintedFiles
    LintedFiles.updateTracking(fileName, currentTime, doc.isDirty);

    // Output information about the analysis
    outputInformation(outputChannel, spinner, fileName, trigger);
    executeTlint(config, vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, doc, diagnostics, spinner, fileName);
}

function outputInformation(outputChannel: vscode.OutputChannel, spinner: vscode.StatusBarItem, fileName: string, trigger: String | null = null) {
    spinner.show();
    spinner.text = `${spinnerLabel} Analyzing 🔍`;

    if (trigger) {
        outputChannel.appendLine(`[Tlint] Trigger: ${trigger}`);
    }

    outputChannel.appendLine(`[Tlint] Analyzing: ${fileName} 🔍`);
}

function executeTlint(
    config: vscode.WorkspaceConfiguration,
    workspaceFolder: string | undefined,
    doc: vscode.TextDocument,
    diagnostics: vscode.DiagnosticCollection,
    spinner: vscode.StatusBarItem,
    fileName: string
) {
    const binaryPath = config.get<string>('binaryPath') || 'tlint';
    const extraArgs = config.get<string>('args') || '';
    const errorFormat = config.get<string>('errorFormat') || 'json';
    const command = config.get<string>('command') || `${binaryPath} lint ${fileName} --${errorFormat} ${extraArgs}`;

    // Log the command being executed
    outputChannel.appendLine(`[Tlint] Executing command: ${command}`);

    // First, run the command with JSON output for linting errors
    cp.exec(command, { cwd: workspaceFolder }, (err, stdout, stderr) => {
        outputChannel.appendLine(`[Tlint] Working directory: ${workspaceFolder || 'undefined'}`);

        if (stdout) {
            outputChannel.appendLine(`[Tlint] Raw stdout: ${stdout}`);
        }

        if (stderr) {
            outputChannel.appendLine(`[Tlint] Raw stderr: ${stderr}`);
        }

        // If we have JSON output, try to parse it for linting errors
        if (stdout && !stderr) {
            try {
                const parsedOutput = JSON.parse(stdout);
                // Check if the output has an 'errors' property (tlint format)
                const results = parsedOutput.errors || parsedOutput;

                outputChannel.appendLine(`[Tlint] Parsed ${results.length} issues`);
                const fileDiagnostics: vscode.Diagnostic[] = [];

                outputChannel.appendLine(`[Tlint] Finished analyzing ${fileName}. ` + (results.length === 0 ? '✅' : '❌'));
                // Only clear diagnostics for the current file, not all files
                diagnostics.delete(doc.uri);

                results.forEach((lint: any) => {
                    // Tlint line numbers are 1-based, VS Code is 0-based
                    const line = lint.line - 1;
                    outputChannel.appendLine(`[Tlint] Issue at line ${lint.line}: ${lint.message}`);

                    const range = new vscode.Range(
                        new vscode.Position(line, 0),
                        new vscode.Position(line, 1000)
                    );

                    const diagnostic = new vscode.Diagnostic(
                        range,
                        lint.message,
                        vscode.DiagnosticSeverity.Warning
                    );

                    diagnostic.source = 'Tlint';
                    fileDiagnostics.push(diagnostic);
                });

                if (results.length === 0) {
                    // If we have an error or stderr, run the command again without JSON to get better error messages
                    const plainCommand = `${binaryPath} lint ${fileName} ${extraArgs}`;

                    outputChannel.appendLine(`[Tlint] Executing plain command to check for syntax errors: ${plainCommand}`);

                    cp.exec(plainCommand, { cwd: workspaceFolder }, (plainErr, plainStdout, plainStderr) => {
                        if (plainStderr && (plainStderr.includes('syntax error') || plainStderr.includes('ParseError'))) {
                            outputChannel.appendLine(`[Tlint] Syntax error detected: ${plainStderr}`);
                            const fileDiagnostics: vscode.Diagnostic[] = [];

                            // Create a diagnostic for the syntax error
                            const diagnostic = new vscode.Diagnostic(
                                new vscode.Range(
                                    new vscode.Position(0, 0),
                                    new vscode.Position(0, 1000)
                                ),
                                `Blade syntax error: ${plainStderr.trim()}`,
                                vscode.DiagnosticSeverity.Error
                            );

                            diagnostic.source = 'Tlint';
                            fileDiagnostics.push(diagnostic);
                            diagnostics.set(doc.uri, fileDiagnostics);

                            outputChannel.appendLine(`[Tlint] Finished analyzing ${fileName}. ❌`);
                        } else if (plainErr) {
                            outputChannel.appendLine(`[Tlint] Error: ${plainErr.message}`);
                            outputChannel.appendLine(`Plain stderr: ${plainStderr}`);

                            // Create a diagnostic for the error
                            const fileDiagnostics: vscode.Diagnostic[] = [];
                            const diagnostic = new vscode.Diagnostic(
                                new vscode.Range(
                                    new vscode.Position(0, 0),
                                    new vscode.Position(0, 1000)
                                ),
                                `Tlint error: ${plainStderr || plainErr.message}`,
                                vscode.DiagnosticSeverity.Error
                            );

                            diagnostic.source = 'Tlint';
                            fileDiagnostics.push(diagnostic);
                            diagnostics.set(doc.uri, fileDiagnostics);
                        } else if (err) {
                            outputChannel.appendLine(`[Tlint] Original error: ${err.message}`);
                            outputChannel.appendLine(`Original stderr: ${stderr}`);

                            // Create a diagnostic for the original error
                            const fileDiagnostics: vscode.Diagnostic[] = [];
                            const diagnostic = new vscode.Diagnostic(
                                new vscode.Range(
                                    new vscode.Position(0, 0),
                                    new vscode.Position(0, 1000)
                                ),
                                `Tlint error: ${stderr || err.message}`,
                                vscode.DiagnosticSeverity.Error
                            );

                            diagnostic.source = 'Tlint';
                            fileDiagnostics.push(diagnostic);
                            diagnostics.set(doc.uri, fileDiagnostics);
                        }
                    });
                }

                diagnostics.set(doc.uri, fileDiagnostics);
            } catch (e) {
                outputChannel.appendLine('[Tlint] Failed to parse JSON output ⚠️');
                outputChannel.appendLine(`Error: ${(e as Error).message}`);
                outputChannel.appendLine(`Stdout: ${stdout}`);
                outputChannel.appendLine(`Stderr: ${stderr}`);
            }
        }

        setTimeout(() => {
            spinner.hide();
        }, 1000);
    });
}

// Function to mark a file as modified
export function markFileAsModified(fileName: string) {
    LintedFiles.markFileAsModified(fileName);
}

// Add this function to register the document change event
export function registerDocumentChangeListener(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.languageId === 'php' ||
                event.document.fileName.endsWith('.blade.php')) {
                markFileAsModified(event.document.fileName);
            }
        })
    );
}
