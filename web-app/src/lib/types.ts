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

export interface ProxyHost {
  id: string;
  domain: string;
  target: string;
  enabled: boolean;
  ssl: boolean;
  createdAt: number;
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
  session: string;
  timestampString: string;
  timestamp: number;
  duration: string;
}

export interface JailedIP {
  ip: string;
  reason: string;
  expiresAt: number;
}

export interface BtmpStats {
  totalFailedAttempts: number;
  topUsers: KotlinPair<string, number>[];
  topIps: KotlinPair<string, number>[];
  recentFailures: BtmpEntry[];
  lastUpdated: number;
  jailedIps: JailedIP[];
  autoJailEnabled: boolean;
  jailThreshold: number;
  jailDurationMinutes: number;
}

export type Screen = 'Dashboard' | 'Containers' | 'Images' | 'Compose' | 'Networks' | 'Volumes' | 'Secrets' | 'Logs' | 'Firewall' | 'Proxy' | 'Settings';
