import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { focusedNode } from '../src/camera/focus'

const camera = new PerspectiveCamera(55, 2, 0.1, 200)
camera.position.set(0, 0, 10)
camera.lookAt(0, 0, 0)
camera.updateMatrixWorld()
camera.updateProjectionMatrix()

describe('focusedNode', () => {
  it('returns the node nearest screen center within threshold', () => {
    const id = focusedNode(
      [
        { id: 'a', position: new Vector3(0.1, 0, 0) },
        { id: 'b', position: new Vector3(3, 3, 0) },
      ],
      camera,
    )
    expect(id).toBe('a')
  })

  it('returns null when nothing is near center', () => {
    const id = focusedNode([{ id: 'b', position: new Vector3(6, 6, 0) }], camera)
    expect(id).toBeNull()
  })

  it('ignores nodes behind the camera', () => {
    const id = focusedNode([{ id: 'c', position: new Vector3(0, 0, 20) }], camera)
    expect(id).toBeNull()
  })
})
