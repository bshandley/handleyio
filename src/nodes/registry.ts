export type NodeAction =
  | { label: string; kind: 'open'; href: string }
  | { label: string; kind: 'copy'; text: string }

export interface GalaxyNode {
  id: string
  label: string
  designation: string
  position: [number, number, number]
  lines: string[]
  actions: NodeAction[]
  dataSourceId?: string
}

export const NODES: GalaxyNode[] = [
  {
    id: 'github',
    label: 'GITHUB',
    designation: 'NODE 01 · GH-SECTOR',
    position: [2.8, 0.25, 0.6],
    lines: ['github.com/bshandley'],
    actions: [{ label: 'Open ↗', kind: 'open', href: 'https://github.com/bshandley' }],
    dataSourceId: 'github',
  },
  {
    id: 'email',
    label: 'EMAIL',
    designation: 'NODE 02 · COMMS-RELAY',
    position: [-1.9, -0.15, 2.4],
    lines: ['hello@handley.io'],
    actions: [
      { label: 'Copy', kind: 'copy', text: 'hello@handley.io' },
      { label: 'Compose ↗', kind: 'open', href: 'mailto:hello@handley.io' },
    ],
  },
  {
    id: 'linkedin',
    label: 'LINKEDIN',
    designation: 'NODE 03 · LI-OUTPOST',
    position: [-0.8, 0.3, -3.0],
    lines: ['Bradley Handley'],
    actions: [
      { label: 'Open ↗', kind: 'open', href: 'https://www.linkedin.com/in/bshandley/' },
    ],
  },
  {
    id: 'pliny',
    label: 'PLINY',
    designation: 'NODE 04 · KANBAN-DOCK',
    position: [1.8, -0.2, -1.9],
    lines: ['getpliny.com', 'Self-hosted kanban board'],
    actions: [{ label: 'Open ↗', kind: 'open', href: 'https://getpliny.com' }],
  },
  {
    id: 'gatehouse',
    label: 'GATEHOUSE',
    designation: 'NODE 05 · VAULT-SECTOR',
    position: [-3.2, 0.15, -0.8],
    lines: ['gatehouse.to', 'Agent secrets vault'],
    actions: [{ label: 'Open ↗', kind: 'open', href: 'https://gatehouse.to' }],
  },
]

export function nodeById(id: string): GalaxyNode {
  const node = NODES.find((n) => n.id === id)
  if (!node) throw new Error(`unknown node: ${id}`)
  return node
}
