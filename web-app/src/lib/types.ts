export interface DockerContainer {
  id: string;
  names: string;
  image: string;
  status: string;
  state: string; // running, exited, etc.
}

export interface CreateContainerRequest {
  name: string;
  image: string;
  ports?: PortMapping[];
  env?: Record<string, string>;
  volumes?: VolumeMapping[];
  networks?: string[];
  restartPolicy?: string;
}

export interface PortMapping {
  containerPort: number;
  hostPort: number;
  protocol?: string;
}

export interface VolumeMapping {
  containerPath: string;
  hostPath: string;
  mode?: string;
}

export interface DockerImage {
  id: string;
  tags: string[];
  size: number;
  created: number;
}

export interface ComposeFile {
  path: string;
  name: string;
  status: string; // active, inactive
}

export interface BatteryStatus {
  percentage: number;
  isCharging: boolean;
  source: string;
}

export interface DockerSecret {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface DockerNetwork {
  id: string;
  name: string;
  driver: string;
  scope: string;
  internal: boolean;
}

export interface NetworkDetails {
  id: string;
  name: string;
  driver: string;
  scope: string;
  internal: boolean;
  ipam: IpamConfig;
  containers: Record<string, NetworkContainerDetails>;
  options: Record<string, string>;
  labels: Record<string, string>;
}

export interface IpamConfig {
  driver: string;
  config: IpamData[];
}

export interface IpamData {
  subnet?: string;
  gateway?: string;
}

export interface NetworkContainerDetails {
  name: string;
  endpointId: string;
  macAddress: string;
  ipv4Address: string;
  ipv6Address: string;
}

export interface DockerVolume {
  name: string;
  driver: string;
  mountpoint: string;
  createdAt?: string;
  size?: string;
}

export interface DockerMount {
  type?: string;
  source?: string;
  destination?: string;
  mode?: string;
  rw?: boolean;
}

export interface ContainerDetails {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  createdAt: string;
  platform: string;
  env: string[];
  labels: Record<string, string>;
  mounts: DockerMount[];
  ports: PortMapping[];
}

export interface VolumeDetails {
  name: string;
  driver: string;
  mountpoint: string;
  labels: Record<string, string>;
  scope: string;
  options: Record<string, string>;
  createdAt?: string;
}

export interface BackupResult {
  success: boolean;
  fileName?: string;
  filePath?: string;
  message: string;
}

export interface SaveComposeRequest {
  name: string;
  content: string;
}

export interface ComposeResult {
  success: boolean;
  message: string;
}

export interface SystemLog {
  name: string;
  path: string;
  size: number;
  lastModified: number;
  isDirectory: boolean;
}

export interface FirewallRule {
  id: string;
  ip: string;
  port?: string;
  protocol: string;
  comment?: string;
  createdAt: number;
}

export interface BlockIPRequest {
  ip: string;
  port?: string;
  protocol: string;
  comment?: string;
}

export interface IptablesRule {
  pkts: string;
  bytes: string;
  target: string;
  prot: string;
  opt: string;
  ins: string;
  out: string;
  source: string;
  destination: string;
  extra: string;
}

export interface ProxyHost {
  id: string;
  domain: string;
  target: string;
  enabled: boolean;
  ssl: boolean;
  websocketEnabled: boolean;
  hstsEnabled: boolean;
  customSslPath?: string;
  createdAt: number;
}

export interface SSLCertificate {
  id: string;
  domain: string;
  certPath: string;
  keyPath: string;
}

export interface ProxyHit {
  timestamp: number;
  ip: string;
  method: string;
  path: string;
  status: number;
  responseTime: number;
  userAgent: string;
}

export interface KotlinPair<A, B> {
  first: A;
  second: B;
}

export interface ProxyStats {
  totalHits: number;
  hitsByStatus: Record<number, number>;
  hitsOverTime: Record<string, number>;
  topPaths: KotlinPair<string, number>[];
  recentHits: ProxyHit[];
}

export interface BtmpEntry {
  user: string;
  ip: string;
  country?: string;
  session: string;
  timestampString: string;
  timestamp: number;
  duration: string;
}

export interface JailedIP {
  ip: string;
  country?: string;
  reason: string;
  expiresAt: number;
}

export interface TopIpEntry {
  ip: string;
  count: number;
  country?: string;
}

export interface BtmpStats {
  totalFailedAttempts: number;
  topUsers: KotlinPair<string, number>[];
  topIps: TopIpEntry[];
  recentFailures: BtmpEntry[];
  lastUpdated: number;
  jailedIps: JailedIP[];
  autoJailEnabled: boolean;
  jailThreshold: number;
  jailDurationMinutes: number;
  refreshIntervalMinutes: number;
  isMonitoringActive: boolean;
}

export interface EmailDomain {
  name: string;
}

export interface EmailUser {
  userAddress: string;
}

export interface CreateEmailUserRequest {
  password: string;
}

export interface UpdateEmailUserPasswordRequest {
  password: string;
}

export interface EmailMailbox {
  name: string;
}

export interface SystemConfig {
  dockerCommand: string;
  dockerComposeCommand: string;
  dockerSocket: string;
  dataRoot: string;
  jamesWebAdminUrl: string;
  appVersion: string;
}

export interface UpdateSystemConfigRequest {
  dockerSocket: string;
  jamesWebAdminUrl: string;
}

export interface JamesContainerStatus {
  exists: boolean;
  running: boolean;
  containerId?: string;
  status: string;
  uptime?: string;
}

export type Screen = 'Dashboard' | 'Containers' | 'Images' | 'Compose' | 'Networks' | 'Resources' | 'Volumes' | 'Secrets' | 'Logs' | 'Firewall' | 'Proxy' | 'Emails' | 'Settings';



