import * as vscode from 'vscode';
import * as cp from 'child_process';
import { LintedFiles } from './lintedFiles';

const outputChannel = vscode.window.createOutputChannel('BladeSense');
const spinnerLabel = "$(sync~spin) BladeSense:";

LintedFiles.initialize(outputChannel);

export function analyze(context: vscode.ExtensionContext, spinner: vscode.StatusBarItem, doc: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection, config: vscode.WorkspaceConfiguration, trigger: String | null = null) {
    const currentTime = Date.now();
    const fileName = doc.fileName;

    // Don't analyze if it's a plain .php file instead of .blade.php
    if (!fileName.endsWith('.blade.php')) {
        return;
    }

    // Use LintedFiles class to manage file tracking
    if (LintedFiles.shouldSkipAnalysis(fileName, currentTime, trigger)) {
        return;
    }

    // Update tracking in LintedFiles
    LintedFiles.updateTracking(fileName, currentTime, doc.isDirty);

    // Output information about the analysis
    outputInformation(outputChannel, spinner, fileName, trigger);
    executeTlint(context, config, vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, doc, diagnostics, spinner, fileName);
}

function outputInformation(outputChannel: vscode.OutputChannel, spinner: vscode.StatusBarItem, fileName: string, trigger: String | null = null) {
    spinner.show();
    spinner.text = `${spinnerLabel} Analyzing 🔍`;

    if (trigger) {
        //
    }

    outputChannel.appendLine(`[BladeSense] Analyzing: ${fileName} 🔍`);
}

function executeTlint(
    context: vscode.ExtensionContext,
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

    outputChannel.appendLine(`[BladeSense] Executing command: ${command}`);

    cp.exec(command, { cwd: workspaceFolder }, async (err, stdout, stderr) => {
        outputChannel.appendLine(`[BladeSense] Working directory: ${workspaceFolder || 'undefined'}`);
        if (stdout) outputChannel.appendLine(`[BladeSense] Raw stdout: ${stdout}`);
        if (stderr) outputChannel.appendLine(`[BladeSense] Raw stderr: ${stderr}`);

        const fileDiagnostics: vscode.Diagnostic[] = [];

        if (stdout && !stderr) {
            try {
                const parsedOutput = JSON.parse(stdout);
                const results = parsedOutput.errors || parsedOutput;

                outputChannel.appendLine(`[BladeSense] Parsed ${results.length} issues`);
                outputChannel.appendLine(`[BladeSense] Finished linting ${fileName}. ${results.length === 0 ? '✅' : '❌'}`);

                diagnostics.delete(doc.uri);

                results.forEach((lint: any) => {
                    const line = lint.line - 1;

                    outputChannel.appendLine(`[BladeSense] Issue at line ${lint.line}: ${lint.message}`);

                    const range = new vscode.Range(
                        new vscode.Position(line, 0),
                        new vscode.Position(line, 1000)
                    );

                    const diagnostic = new vscode.Diagnostic(
                        range,
                        lint.message,
                        vscode.DiagnosticSeverity.Warning
                    );

                    diagnostic.source = 'BladeSense';

                    fileDiagnostics.push(diagnostic);
                });
            } catch (e) {
                outputChannel.appendLine('[BladeSense] Failed to parse JSON output ⚠️');
                outputChannel.appendLine(`Error: ${(e as Error).message}`);
                outputChannel.appendLine(`Stdout: ${stdout}`);
                outputChannel.appendLine(`Stderr: ${stderr}`);
            }
        }

        if (fileName.endsWith('.blade.php')) {
            await checkBladeSyntax(context, workspaceFolder, fileName, fileDiagnostics);
        }

        // ✅ Now set diagnostics *after* everything
        diagnostics.set(doc.uri, fileDiagnostics);

        setTimeout(() => spinner.hide(), 1000);
    });
}

function checkBladeSyntax(
    context: vscode.ExtensionContext,
    workspaceFolder: string | undefined,
    fileName: string,
    diagnostics: vscode.Diagnostic[]
): Promise<void> {
    return new Promise((resolve) => {
        if (!workspaceFolder) {
            outputChannel.appendLine('[BladeSense] No workspace folder found');
            return resolve();
        }

        const scriptPath = context.asAbsolutePath('scripts/blade-syntax-check.php');

        outputChannel.appendLine(`[BladeSense] Opening: ${scriptPath}`);

        const config = vscode.workspace.getConfiguration('blade');
        const phpBinaryPath = config.get<string>('phpBinaryPath') || 'php';
        const customCommand = config.get<string>('syntaxCheckCommand') || '';

        // Use custom command if provided, otherwise build the command
        const command = customCommand
            ? customCommand.replace('${fileName}', fileName)
            : `${phpBinaryPath} ${scriptPath} ${fileName}`;

        outputChannel.appendLine(`[BladeSense] Checking syntax for ${fileName}`);

        cp.exec(command, { cwd: workspaceFolder }, (err, stdout, stderr) => {
            if (stdout) outputChannel.appendLine(`[BladeSense] Raw stdout: ${stdout}`);
            if (stderr) outputChannel.appendLine(`[BladeSense] Raw stderr: ${stderr}`);

            if (stderr) {
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1000)),
                    stderr,
                    vscode.DiagnosticSeverity.Error
                );

                diagnostic.source = 'BladeSense';
                diagnostics.push(diagnostic);

                vscode.window.showErrorMessage(`[BladeSense] ${stderr}`);
            }

            if (err) {
                try {
                    const result = JSON.parse(stdout);

                    if (result.error) {
                        const diagnostic = new vscode.Diagnostic(
                            new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1000)),
                            result.error,
                            vscode.DiagnosticSeverity.Error
                        );

                        diagnostic.source = 'BladeSense';
                        diagnostics.push(diagnostic);
                    }
                } catch (e) {
                    outputChannel.appendLine(`[BladeSense] Failed to parse output: ${stdout}`);
                }
            } else {
                outputChannel.appendLine('[BladeSense] No syntax errors detected ✅');
            }

            return resolve();
        });
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
