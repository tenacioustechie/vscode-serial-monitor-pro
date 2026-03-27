export interface PortConfig {
  path: string;
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  stopBits: 1 | 1.5 | 2;
  parity: 'none' | 'even' | 'odd' | 'mark' | 'space';
  lineEnding: string;
}

export interface PortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  locationId?: string;
  productId?: string;
  vendorId?: string;
}

export const STANDARD_BAUD_RATES = [
  300, 1200, 2400, 4800, 9600, 14400, 19200,
  28800, 38400, 57600, 76800, 115200, 230400,
  460800, 576000, 921600,
];

export const DEFAULT_PORT_CONFIG: Omit<PortConfig, 'path'> = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  lineEnding: '\n',
};
