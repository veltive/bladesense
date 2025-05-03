import * as vscode from 'vscode';
import { runTlint, registerDocumentChangeListener } from './tlintRunner';

export function activate(context: vscode.ExtensionContext) {
    // Create a status bar item with a spinner
    const spinner = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    spinner.text = '';

    context.subscriptions.push(spinner);

    const diagnosticCollection = vscode.languages.createDiagnosticCollection('tlint');
    context.subscriptions.push(diagnosticCollection);

    const config = vscode.workspace.getConfiguration('tlint');

    // Activating extension
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && (activeEditor.document.languageId === 'php' ||
                         activeEditor.document.fileName.endsWith('.blade.php'))) {
        runTlint(spinner, activeEditor.document, diagnosticCollection, config);
    }

    // Opening a document
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(doc => {
            // Only run Tlint if the document is PHP/Blade and not being peeked
            if ((doc.languageId === 'php' || doc.fileName.endsWith('.blade.php')) && !isPeeking(doc)) {
                runTlint(spinner, doc, diagnosticCollection, config, 'Opened document');
            }
        })
    );

    // Active editor changed
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && (editor.document.languageId === 'php' ||
                          editor.document.fileName.endsWith('.blade.php'))) {
                runTlint(spinner, editor.document, diagnosticCollection, config, 'Changed active editor');
            }
        })
    );

    // Saving a document
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(doc => {
            // Only run Tlint if the document is PHP/Blade and not being peeked
            if ((doc.languageId === 'php' || doc.fileName.endsWith('.blade.php')) && !isPeeking(doc)) {
                runTlint(spinner, doc, diagnosticCollection, config, 'Saved document');
            }
        })
    );

    // Command to manually trigger Tlint analysis
    context.subscriptions.push(
        vscode.commands.registerCommand('tlint-inline.analyze', () => {
            const editor = vscode.window.activeTextEditor;

            if (editor && (editor.document.languageId === 'php' ||
                          editor.document.fileName.endsWith('.blade.php'))) {
                runTlint(spinner, editor.document, diagnosticCollection, config, 'Manually triggered analysis');
            }
        })
    );

    // Helper function to check if a document is being peeked
    function isPeeking(document: vscode.TextDocument): boolean {
        // Check various schemes that might indicate peeking
        const peekSchemes = ['vscode-peek', 'peek-preview', 'gitlens-git', 'git'];

        // Check if the document URI scheme indicates it's being peeked
        if (peekSchemes.includes(document.uri.scheme)) {
            return true;
        }

        // Check if the document is temporary (often the case with peek)
        if (document.uri.path.includes('/.peek-')) {
            return true;
        }

        // Check if the document is in the active editor (not being peeked)
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document === document) {
            return false;
        }

        // If we can't determine for sure, assume it's being peeked
        return true;
    }

    // Register the document change listener
    registerDocumentChangeListener(context);
}

export function deactivate() {}
