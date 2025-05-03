<?php

// Get the file path from command line argument
$viewPath = $argv[1] ?? null;

if (!$viewPath || !file_exists($viewPath)) {
    echo json_encode(['error' => 'Invalid file path provided']);
    exit(1);
}

// Use the workspace's vendor/autoload.php instead of the extension's
$autoloadPath = dirname(getcwd()) . '/vendor/autoload.php';
if (!file_exists($autoloadPath)) {
    // Try current directory
    $autoloadPath = getcwd() . '/vendor/autoload.php';
    if (!file_exists($autoloadPath)) {
        echo json_encode(['error' => 'Could not find Laravel autoload.php']);
        exit(1);
    }
}

require $autoloadPath;

use Illuminate\View\Compilers\BladeCompiler;
use Illuminate\Filesystem\Filesystem;

try {
    $compiledDir = getcwd() . '/storage/framework/views';

    $filesystem = new Filesystem();
    $compiler = new BladeCompiler($filesystem, $compiledDir);

    // Ensure the compiled directory exists
    if (!is_dir($compiledDir)) {
        mkdir($compiledDir, 0755, true);
    }

    // Compile the actual file
    $compiler->compile($viewPath);
    $compiledPath = $compiler->getCompiledPath($viewPath);

    // Use PHP linter to check for syntax errors
    $output = [];
    $returnVar = 0;
    exec('php -l ' . escapeshellarg($compiledPath), $output, $returnVar);

    if ($returnVar !== 0) {
        echo json_encode(['error' => implode("\n", $output)]);
        exit(1);
    } else {
        echo json_encode(['success' => true]);
        exit(0);
    }
} catch (Throwable $e) {
    echo json_encode(['error' => $e->getMessage()]);
    exit(1);
}
