export interface DockerContainer {
  id: string;
  names: string;
  image: string;
  status: string;
  state: string; // running, exited, etc.
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
}

export type Screen = 'Containers' | 'Images' | 'Compose' | 'Networks' | 'Volumes' | 'Secrets' | 'Settings';
