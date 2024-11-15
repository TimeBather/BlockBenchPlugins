import 'blockbench-types'
import { Material, Matrix3, Vector2, Vector3, Mesh as THREEMesh } from 'three';


const cube_face_normals = {
	north: [0, 0, -1],
	east: [1, 0, 0],
	south: [0, 0, 1],
	west: [-1, 0, 0],
	up: [0, 1, 0],
	down: [0, -1, 0],
}

export class ObjectFileIdManager{
    currentAllocatedVertexId: number = 1;
    currentAllocatedUVId: number = 1;
    currentAllocatedNormalId: number = 1;

    allocateVertexId(){
        return this.currentAllocatedVertexId++;
    }

    allocateUVId(){
        return this.currentAllocatedUVId++;
    }

    allocateNormalId(){
        return this.currentAllocatedNormalId++;
    }
}


class ObjectFace{
    vertexs: number[] = [];
    normal: Vector3 = new Vector3();
    material: string = '';
    uv: Vector2[] = [];

    uvNumber: number[] = [];
    normalNumber: number = -1;

    public static create(){
        return new ObjectFace();
    }

    public pushVertex(vertex: number){
        this.vertexs.push(vertex);
        return this;
    }

    public pushUVCoordinate(uv: Vector2){
        this.uv.push(uv.clone());
        return this;
    }

    public setNormal(normal: Vector3){
        this.normal = normal.clone();
        return this;
    }

    public setMaterial(material: string){
        this.material = material;
        return this;
    }
}

class ObjContextManager {
    idManager: ObjectFileIdManager;
    vertexs: Vector3[] = [];
    faces: ObjectFace[] = [];

    vertexIndexMap: number[] = [];

    materials: Record<string, Texture> = {};

    constructor(idManager: ObjectFileIdManager){
        this.idManager = idManager;
    }

    writeVertex(v: Vector3){
        let newIndex = this.vertexs.length;
        this.vertexs.push(v.clone());
        return newIndex;
    }

    writeFace(face: ObjectFace){
        this.faces.push(face);
    }

    writeMaterial(material: Texture){
        this.materials[material.id] = material;
    }

    public write(command: {
        write: (...text: any) => void,
        material: (text: string) => void,
    }){
        const {write, material} = command;
        this.vertexs.forEach((v)=>{
            write `v ${v.x} ${v.y} ${v.z}`;
            this.vertexIndexMap.push(this.idManager.allocateVertexId());
        });

        this.faces.forEach((face)=>{
            face.uv.forEach((uv)=>{
                write `vt ${uv.x} ${uv.y}`;
                face.uvNumber.push(this.idManager.allocateUVId());
            });
        });

        this.faces.forEach((face)=>{
            write `vn ${face.normal.x} ${face.normal.y} ${face.normal.z}`;
            face.normalNumber = this.idManager.allocateNormalId();
        });

        this.faces.forEach((face)=>{
            write `usemtl ${face.material}`;
            write `f ${(face.vertexs
                .map(t=>this.vertexIndexMap[t])
                .map((t, i)=> t + '/' + (face.uvNumber[i]) + '/' + (face.normalNumber))
            ).join(' ')}`;
        });

        return {
            materials: this.materials
        };
    }
}

export function transformMeshToObject(meshes: THREEMesh[], context: {
    exportScale: number,
    exportMode: string
}, command: {
    write: (...text: any) => void,
    material: (text: string) => void,
}, idManager: ObjectFileIdManager): {
    materials: Record<string, Texture>
} {
    const manager = new ObjContextManager(idManager);

    function writeCube(mesh: THREEMesh, element: Cube){
        
        const normalMatrixWorld = new Matrix3();
        normalMatrixWorld.getNormalMatrix( mesh['matrixWorld'] );

        let vertex = new Vector3();
        let normal = new Vector3();
        let elementVertexs : number[] = [];

        element.getGlobalVertexPositions().forEach((coords) => {
            vertex.set(...coords).divideScalar(context.exportScale);
            elementVertexs.push(manager.writeVertex(vertex));
        })
        for(let key in element.faces){
            if(element.faces[key].texture !== null){
                let texture = element.faces[key].getTexture();
                let uv_size = [Project!['getUVWidth'](texture), Project!['getUVHeight'](texture)];
                
                let faceUVs: Vector2[] = [];
                [
                    [element.faces[key].uv[0], element.faces[key].uv[1]],
                    [element.faces[key].uv[2], element.faces[key].uv[1]],
                    [element.faces[key].uv[2], element.faces[key].uv[3]],
                    [element.faces[key].uv[0], element.faces[key].uv[3]]
                ].forEach(([u, v])=>{
                    faceUVs.push(new Vector2(u / uv_size[0], 1 - v / uv_size[1]));
                });

                let rot = element.faces[key].rotation || 0;
                while (rot > 0) {
                    faceUVs.unshift(faceUVs.pop()!);
                    rot -= 90;
                }

                normal.fromArray(cube_face_normals[key]);
                normal.applyMatrix3(normalMatrixWorld).normalize();

                let vertices: number[];
                switch (key) {
                    case 'north': vertices = [2, 5, 7, 4]; break;
                    case 'east':  vertices = [1, 2, 4, 3]; break;
                    case 'south': vertices = [6, 1, 3, 8]; break;
                    case 'west':  vertices = [5, 6, 8, 7]; break;
                    case 'up':    vertices = [5, 2, 1, 6]; break;
                    case 'down':  vertices = [8, 3, 4, 7]; break;
                    default: continue;
                }

                let objFace = ObjectFace.create();
                vertices.forEach((v, i) => {
                    objFace.pushVertex(elementVertexs[v - 1])
                          .pushUVCoordinate(faceUVs[i]);
                });
                objFace.setNormal(normal)
                       .setMaterial(!texture || typeof texture === 'string' ? 'none' : 'm_' + texture.uuid);

                manager.writeFace(objFace);
                manager.writeMaterial(texture!);
            }
        }
    }

    
    function writeMesh(mesh: THREEMesh, element: Mesh) {
        const normalMatrixWorld = new Matrix3();
        normalMatrixWorld.getNormalMatrix(mesh['matrixWorld']);
    
        let vertex = new Vector3();
        let normal = new Vector3();
        let vertex_keys: string[] = [];
        let elementVertexs: number[] = [];
    
        for (let vkey in element.vertices) {
            vertex.set(...element.vertices[vkey]);
            vertex.applyMatrix4(mesh['matrixWorld']).divideScalar(context.exportScale);
            elementVertexs.push(manager.writeVertex(vertex));
            vertex_keys.push(vkey);
        }
        for (let key in element.faces) {
            let face = element.faces[key];
            if (face.texture !== null && face.vertices.length >= 3) {
                let texture = face.getTexture();
                let vertices = face.getSortedVertices().slice();
                let uv_size = [Project!['getUVWidth'](texture), Project!['getUVHeight'](texture)];
    
                let faceUVs: Vector2[] = [];
                vertices.forEach(vkey => {
                    faceUVs.push(new Vector2(face.uv[vkey][0] / uv_size[0], 1 - face.uv[vkey][1] / uv_size[1]));
                });
    
                normal.fromArray(face.getNormal(true));
                normal.applyMatrix3(normalMatrixWorld).normalize();
    
                if (context.exportMode === 'tris' && vertices.length === 4) {
                    let objFace1 = ObjectFace.create();
                    [0, 1, 2].forEach(i => {
                        objFace1.pushVertex(elementVertexs[vertex_keys.indexOf(vertices[i])])
                               .pushUVCoordinate(faceUVs[i]);
                    });
                    objFace1.setNormal(normal)
                            .setMaterial(!texture || typeof texture === 'string' ? 'none' : 'm_' + texture.uuid);
                    manager.writeFace(objFace1);
    
                    let objFace2 = ObjectFace.create();
                    [0, 2, 3].forEach(i => {
                        objFace2.pushVertex(elementVertexs[vertex_keys.indexOf(vertices[i])])
                               .pushUVCoordinate(faceUVs[i]);
                    });
                    objFace2.setNormal(normal)
                            .setMaterial(!texture || typeof texture === 'string' ? 'none' : 'm_' + texture.uuid);
                    manager.writeFace(objFace2);
                } else {
                    if (context.exportMode === 'quads' && vertices.length === 3) {
                        vertices.push(vertices[0]);
                        faceUVs.push(faceUVs[0]);
                    }
    
                    let objFace = ObjectFace.create();
                    vertices.forEach((vkey, i) => {
                        objFace.pushVertex(elementVertexs[vertex_keys.indexOf(vkey)])
                               .pushUVCoordinate(faceUVs[i]);
                    });
                    objFace.setNormal(normal)
                           .setMaterial(!texture || typeof texture === 'string' ? 'none' : 'm_' + texture.uuid);
                    manager.writeFace(objFace);
                }
                manager.writeMaterial(texture!);
            }
        }
    }

    function writeOther(mesh: THREEMesh, element: any) {
        throw new Error("Write type other is current not supported yet");
    }

    meshes.forEach((mesh)=>{
        var geometry = mesh['geometry'];
        var element  = OutlinerNode.uuids[mesh.name];
        if(!element || element.export == false) return;

        if(element instanceof Cube){
            writeCube(mesh, element);
        }else if(element instanceof Mesh){
            writeMesh(mesh, element);
        }else{
            writeOther(mesh, element);
        }
    });

    return manager.write(command);
}

