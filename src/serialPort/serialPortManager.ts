import * as vscode from 'vscode';
import { SerialPort } from 'serialport';
import { PortInfo } from './types';

export class SerialPortManager implements vscode.TreeDataProvider<PortTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PortTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private ports: PortInfo[] = [];

  async refresh(): Promise<void> {
    try {
      const portList = await SerialPort.list();
      this.ports = portList.map((p) => ({
        path: p.path,
        manufacturer: p.manufacturer,
        serialNumber: p.serialNumber,
        pnpId: p.pnpId,
        locationId: p.locationId,
        productId: p.productId,
        vendorId: p.vendorId,
      }));
    } catch (err) {
      this.ports = [];
      vscode.window.showErrorMessage(`Failed to list serial ports: ${err}`);
    }
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: PortTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: PortTreeItem): Thenable<PortTreeItem[]> {
    if (element) {
      // Port details as children
      const details: PortTreeItem[] = [];
      if (element.portInfo.manufacturer) {
        details.push(new PortTreeItem(
          `Manufacturer: ${element.portInfo.manufacturer}`,
          element.portInfo,
          vscode.TreeItemCollapsibleState.None,
          true
        ));
      }
      if (element.portInfo.serialNumber) {
        details.push(new PortTreeItem(
          `Serial: ${element.portInfo.serialNumber}`,
          element.portInfo,
          vscode.TreeItemCollapsibleState.None,
          true
        ));
      }
      if (element.portInfo.vendorId) {
        details.push(new PortTreeItem(
          `VID: ${element.portInfo.vendorId} / PID: ${element.portInfo.productId ?? 'N/A'}`,
          element.portInfo,
          vscode.TreeItemCollapsibleState.None,
          true
        ));
      }
      return Promise.resolve(details);
    }

    return Promise.resolve(
      this.ports.map((p) => {
        const hasDetails = !!(p.manufacturer || p.serialNumber || p.vendorId);
        return new PortTreeItem(
          p.path,
          p,
          hasDetails
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None,
          false
        );
      })
    );
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

export class PortTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly portInfo: PortInfo,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly isDetail: boolean = false,
  ) {
    super(label, collapsibleState);

    if (!isDetail) {
      this.contextValue = 'serialPort';
      this.tooltip = `${portInfo.path}${portInfo.manufacturer ? ` (${portInfo.manufacturer})` : ''}`;
      this.iconPath = new vscode.ThemeIcon('plug');
      this.command = {
        command: 'serialMonitorPlus.openMonitor',
        title: 'Open Monitor',
        arguments: [this],
      };
    } else {
      this.contextValue = 'serialPortDetail';
      this.iconPath = new vscode.ThemeIcon('info');
    }
  }
}
