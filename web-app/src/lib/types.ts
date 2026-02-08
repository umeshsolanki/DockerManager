export interface DockerContainer {
  id: string;
  names: string;
  image: string;
  status: string;
  state: string; // running, exited, etc.
  ipAddress?: string;
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
  otherFiles?: string[];
}

export interface DockerStack {
  name: string;
  services: number;
  orchestrator?: string;
}

export interface StackService {
  id: string;
  name: string;
  image: string;
  mode: string;
  replicas: string;
  ports?: string;
}

export interface StackTask {
  id: string;
  name: string;
  image: string;
  node: string;
  desiredState: string;
  currentState: string;
  error?: string;
  ports?: string;
}

export interface DeployStackRequest {
  stackName: string;
  composeFile: string;
}

export interface MigrateComposeToStackRequest {
  composeFile: string;
  stackName: string;
}

export interface StopStackRequest {
  stackName: string;
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
  attachable: boolean;
  ingress: boolean;
  enableIPv6: boolean;
  ipam: IpamConfig;
  containers: Record<string, NetworkContainerDetails>;
  options: Record<string, string>;
  labels: Record<string, string>;
  createdAt?: string;
}

export interface IpamConfig {
  driver: string;
  config: IpamData[];
}

export interface IpamData {
  subnet?: string;
  gateway?: string;
  ipRange?: string;
  auxAddresses?: Record<string, string>;
}

export interface NetworkContainerDetails {
  name: string;
  endpointId: string;
  macAddress: string;
  ipv4Address: string;
  ipv6Address: string;
}

export interface CreateNetworkRequest {
  name: string;
  driver?: string;
  internal?: boolean;
  attachable?: boolean;
  checkDuplicate?: boolean;
  labels?: Record<string, string>;
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
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  exitCode?: number;
  error?: string;
  platform: string;
  driver?: string;
  hostname?: string;
  workingDir?: string;
  command?: string[];
  entrypoint?: string[];
  restartPolicy?: string;
  autoRemove?: boolean;
  privileged?: boolean;
  tty?: boolean;
  stdinOpen?: boolean;
  env: string[];
  labels: Record<string, string>;
  mounts: DockerMount[];
  ports: PortMapping[];
  networks: Record<string, NetworkContainerDetails>;
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

export interface SaveProjectFileRequest {
  projectName: string;
  fileName: string;
  content: string;
}

export interface ComposeResult {
  success: boolean;
  message: string;
}

export interface FileItem {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  lastModified: number;
  extension?: string;
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

export interface RateLimit {
  enabled: boolean;
  rate: number;
  period: 's' | 'm';
  burst: number;
  nodelay: boolean;
}

export interface PathRoute {
  id: string;
  path: string;
  target: string;
  websocketEnabled: boolean;
  allowedIps?: string[];
  stripPrefix: boolean;
  customConfig?: string;
  enabled?: boolean;
  name?: string;
  order?: number;
  rateLimit?: RateLimit;
  isStatic?: boolean;
}

export interface CustomPage {
  id: string;
  title: string;
  content: string;
  createdAt: number;
}

export interface DnsConfig {
  id: string;
  name: string;
  provider: string; // cloudflare, digitalocean, manual
  apiToken?: string;
  dnsHost?: string;
  authUrl?: string;
  cleanupUrl?: string;
  authScript?: string;
  cleanupScript?: string;
  createdAt: number;
}

export interface ProxyHost {
  id: string;
  domain: string;
  target: string;
  enabled: boolean;
  ssl: boolean;
  websocketEnabled: boolean;
  hstsEnabled: boolean;
  isWildcard?: boolean; // Enable wildcard SSL certificate (*.domain.com)
  dnsConfigId?: string; // Reference to saved DNS config
  customSslPath?: string;
  allowedIps?: string[];
  paths?: PathRoute[];
  createdAt: number;
  sslChallengeType?: 'http' | 'dns';
  dnsProvider?: string;
  dnsApiToken?: string;
  dnsHost?: string;
  dnsAuthUrl?: string;
  dnsCleanupUrl?: string;
  dnsAuthScript?: string;
  dnsCleanupScript?: string;
  rateLimit?: RateLimit;
  isStatic?: boolean;
  silentDrop?: boolean;
  underConstruction?: boolean;
  underConstructionPageId?: string;
}

export interface SSLCertificate {
  id: string;
  domain: string;
  certPath: string;
  keyPath: string;
  type?: string; // "letsencrypt" or "custom"
  isWildcard?: boolean;
  expiresAt?: number; // Unix timestamp
  issuer?: string;
}

export interface ProxyHit {
  timestamp: number;
  ip: string;
  method: string;
  path: string;
  status: number;
  responseTime: number;
  userAgent: string;
  domain?: string;
  referer?: string;
}

export interface PathHit {
  path: string;
  count: number;
}

export interface GenericHitEntry {
  label: string;
  count: number;
}

export enum ProxyJailRuleType {
  USER_AGENT = 'USER_AGENT',
  METHOD = 'METHOD',
  PATH = 'PATH',
  STATUS_CODE = 'STATUS_CODE'
}

export interface ProxyJailRule {
  id: string;
  type: ProxyJailRuleType;
  pattern: string;
  description?: string;
}

export interface WebSocketConnection {
  timestamp: number;
  endpoint: string;
  ip: string;
  userAgent?: string;
  containerId?: string;
  authenticated: boolean;
  duration?: number; // Duration in milliseconds, null if still connected
}

export interface ProxyStats {
  totalHits: number;
  hitsByStatus: Record<number, number>;
  hitsOverTime: Record<string, number>;
  topPaths: PathHit[];
  recentHits: ProxyHit[];
  hitsByDomain: Record<string, number>;
  hitsByDomainErrors: Record<string, number>;
  topIps: GenericHitEntry[];
  topIpsWithErrors: GenericHitEntry[];
  topUserAgents: GenericHitEntry[];
  topReferers: GenericHitEntry[];
  topMethods: GenericHitEntry[];
  websocketConnections: number;
  websocketConnectionsByEndpoint: Record<string, number>;
  websocketConnectionsByIp: Record<string, number>;
  hitsByCountry?: Record<string, number>;
  hitsByProvider?: Record<string, number>;
  recentWebSocketConnections: WebSocketConnection[];
  hostwiseStats?: Record<string, DetailedHostStats>;
}

export interface DetailedHostStats {
  totalHits: number;
  hitsByStatus: Record<number, number>;
  topPaths: PathHit[];
  topIps: GenericHitEntry[];
  topMethods: GenericHitEntry[];
}

export interface DailyProxyStats {
  date: string;
  totalHits: number;
  hitsByStatus: Record<number, number>;
  hitsOverTime: Record<string, number>;
  topPaths: PathHit[];
  hitsByDomain: Record<string, number>;
  hitsByDomainErrors: Record<string, number>;
  topIps: GenericHitEntry[];
  topIpsWithErrors: GenericHitEntry[];
  topUserAgents: GenericHitEntry[];
  topReferers: GenericHitEntry[];
  topMethods: GenericHitEntry[];
  websocketConnections: number;
  websocketConnectionsByEndpoint: Record<string, number>;
  websocketConnectionsByIp: Record<string, number>;
  hitsByCountry?: Record<string, number>;
  hitsByProvider?: Record<string, number>;
  hostwiseStats?: Record<string, DetailedHostStats>;
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

export interface KafkaSettings {
  enabled: boolean;
  bootstrapServers: string;
  adminHost: string;
  topic: string;
  reputationTopic: string;
  groupId: string;
}

export interface KafkaTopicInfo {
  name: string;
  partitions: number;
  replicationFactor: number;
}

export interface KafkaRule {
  id: string;
  name: string;
  topic: string;
  condition: string;
  transformations: Record<string, string>;
  storeInDb: boolean;
  enabled: boolean;
}

export interface KafkaProcessedEvent {
  id: string;
  originalTopic: string;
  timestamp: number;
  originalValue: string;
  processedValue: string;
  appliedRules: string[];
}

export interface KafkaMessage {
  topic: string;
  partition: number;
  offset: number;
  key: string | null;
  value: string;
  timestamp: number;
}

export interface ClickHouseSettings {
  enabled: boolean;
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  batchSize: number;
  flushIntervalMs: number;
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
  proxyStatsActive: boolean;
  proxyStatsIntervalMs: number;
  proxyJailEnabled: boolean;
  proxyJailThresholdNon200: number;
  proxyJailRules: ProxyJailRule[];
  proxyDefaultReturn404: boolean;
  storageBackend: string;
  dockerBuildKit: boolean;
  dockerCliBuild: boolean;
  autoStorageRefresh: boolean;
  autoStorageRefreshIntervalMinutes: number;
  kafkaSettings: KafkaSettings;
  dbPersistenceLogsEnabled: boolean;
  osName: string;
  syslogEnabled: boolean;
  syslogServer: string;
  syslogServerInternal?: string;
  syslogPort: number;
  syslogIsRunning: boolean;
  proxyRsyslogEnabled: boolean;
  proxyDualLoggingEnabled?: boolean;
  jsonLoggingEnabled: boolean;
  nginxLogDir: string;
  logBufferingEnabled: boolean;
  logBufferSizeKb: number;
  logFlushIntervalSeconds: number;
  clickhouseSettings: ClickHouseSettings;
}

export interface UpdateSystemConfigRequest {
  dockerSocket: string;
  jamesWebAdminUrl: string;
  dockerBuildKit?: boolean;
  dockerCliBuild?: boolean;
  autoStorageRefresh?: boolean;
  autoStorageRefreshIntervalMinutes?: number;
  kafkaSettings?: KafkaSettings;
  dbPersistenceLogsEnabled?: boolean;
  syslogEnabled?: boolean;
  syslogServer?: string;
  syslogServerInternal?: string;
  syslogPort?: number;
  proxyRsyslogEnabled?: boolean;
  proxyDualLoggingEnabled?: boolean;
  jsonLoggingEnabled?: boolean;
  nginxLogDir?: string;
  clickhouseSettings?: ClickHouseSettings;
  logBufferingEnabled?: boolean;
  logBufferSizeKb?: number;
  logFlushIntervalSeconds?: number;
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

export type Screen = 'Dashboard' | 'Docker' | 'Containers' | 'Images' | 'Compose' | 'Networks' | 'Resources' | 'Volumes' | 'Secrets' | 'Logs' | 'Firewall' | 'Proxy' | 'Emails' | 'Files' | 'Settings' | 'Security' | 'Analytics' | 'DB' | 'Kafka' | 'IP';


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

export interface RedisConfig {
  enabled: boolean;
  host: string;
  port: number;
  password?: string | null;
  database: number;
  ssl: boolean;
  timeout: number;
}

export interface RedisStatus {
  enabled: boolean;
  connected: boolean;
  host: string;
  port: number;
}

export interface RedisTestResult {
  success: boolean;
  message: string;
  connected: boolean;
}

export interface RedisConfigUpdateResult {
  success: boolean;
  message: string;
  connected: boolean;
}

export interface DiskPartition {
  path: string;
  total: number;
  free: number;
  used: number;
  usagePercentage: number;
}

export interface DockerStorageUsage {
  imagesSize: number;
  containersSize: number;
  volumesSize: number;
  buildCacheSize: number;
}

export interface StorageInfo {
  total: number;
  free: number;
  used: number;
  dataRootSize: number;
  dataRootPath: string;
  partitions: DiskPartition[];
  dockerUsage: DockerStorageUsage | null;
}

export interface ExternalDbConfig {
  id: string;
  name: string;
  type: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

export interface SqlQueryRequest {
  sql: string;
  externalDbId?: string;
}


export interface IpReputation {
  ip: string;
  firstObserved: string;
  lastActivity: string;
  firstBlocked?: string;
  blockedTimes: number;
  lastBlocked?: string;
  reasons: string[];
  country?: string;
}

export interface SavedQuery {
  id: number;
  name: string;
  sql: string;
  createdAt?: string;
}
