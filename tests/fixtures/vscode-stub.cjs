// Minimal `vscode` API surface used by src/extension.ts.
// Tracks createTreeView and registerCommand calls so tests can assert against them.

const _calls = {
  createTreeView: [],
  registerCommand: [],
  errors: [],
};

class Disposable {
  constructor(callOnDispose) {
    this._callOnDispose = callOnDispose;
  }
  dispose() { if (typeof this._callOnDispose === 'function') this._callOnDispose(); }
  static from(...disposables) {
    return new Disposable(() => disposables.forEach((d) => d && d.dispose && d.dispose()));
  }
}

class EventEmitter {
  constructor() {
    this.event = () => ({ dispose() {} });
  }
  fire() {}
  dispose() {}
}

class TreeItem {
  constructor(label, collapsibleState) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

class ThemeIcon {
  constructor(id) { this.id = id; }
}

const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };

const window = {
  createTreeView(id, opts) {
    _calls.createTreeView.push({ id, hasProvider: !!(opts && opts.treeDataProvider) });
    return { dispose() {} };
  },
  showErrorMessage(msg) { _calls.errors.push(msg); return Promise.resolve(undefined); },
  showWarningMessage() { return Promise.resolve(undefined); },
  showInformationMessage() { return Promise.resolve(undefined); },
  showInputBox() { return Promise.resolve(undefined); },
  showQuickPick() { return Promise.resolve(undefined); },
};

const commands = {
  registerCommand(id /* , cb */) {
    _calls.registerCommand.push(id);
    return { dispose() {} };
  },
};

const Uri = {
  file: (p) => ({ fsPath: p, toString: () => p }),
  joinPath: (base, ...segs) => {
    const root = (base && base.fsPath) || '';
    const joined = [root, ...segs].filter(Boolean).join('/');
    return { fsPath: joined, toString: () => joined };
  },
};

const ViewColumn = { One: 1, Two: 2, Three: 3 };

const workspace = {
  getConfiguration() {
    return {
      get: (_key, fallback) => fallback,
      has: () => false,
      inspect: () => undefined,
      update: () => Promise.resolve(),
    };
  },
  workspaceFolders: undefined,
};

module.exports = {
  _calls,
  window,
  commands,
  workspace,
  Disposable,
  EventEmitter,
  TreeItem,
  ThemeIcon,
  TreeItemCollapsibleState,
  Uri,
  ViewColumn,
};
