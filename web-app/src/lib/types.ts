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
  allowedIps?: string[];
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

export interface PathHit {
  path: string;
  count: number;
}

export interface ProxyStats {
  totalHits: number;
  hitsByStatus: Record<number, number>;
  hitsOverTime: Record<string, number>;
  topPaths: PathHit[];
  recentHits: ProxyHit[];
  hitsByDomain: Record<string, number>;
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

export interface TopUserEntry {
  user: string;
  count: number;
}

export interface BtmpStats {
  totalFailedAttempts: number;
  topUsers: TopUserEntry[];
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
  twoFactorEnabled: boolean;
  username: string;
  proxyStatsActive?: boolean;
  proxyStatsIntervalMs?: number;
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

export interface EmailGroup {
  address: string;
  members: string[];
}

export interface EmailQuota {
  type: string;
  value: number;
  limit?: number;
}

export interface EmailUserDetail {
  userAddress: string;
  quotaSize?: EmailQuota;
  quotaCount?: EmailQuota;
}

export type Screen = 'Dashboard' | 'Containers' | 'Images' | 'Compose' | 'Networks' | 'Resources' | 'Volumes' | 'Secrets' | 'Logs' | 'Firewall' | 'Proxy' | 'Emails' | 'Settings';


export interface AuthRequest {
  username?: string;
  password: string;
  otpCode?: string;
}

export interface AuthResponse {
  token: string;
  requires2FA?: boolean;
}

export interface UpdatePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UpdateUsernameRequest {
  currentPassword: string;
  newUsername: string;
}

export interface TwoFactorSetupResponse {
  secret: string;
  qrUri: string;
}

export interface Enable2FARequest {
  secret: string;
  code: string;
}

export interface ProxyActionResult {
  success: boolean;
  message: string;
}

export interface EmailTestRequest {
  userAddress: string;
  password: string;
  testType?: string;
}

export interface EmailTestResult {
  success: boolean;
  message: string;
  logs: string[];
}


