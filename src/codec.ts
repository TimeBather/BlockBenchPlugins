import 'blockbench-types'
import { Color, Vector2, Vector3, Matrix3, Mesh as THREEMesh } from 'three';
import { nanoid } from 'nanoid';
import { ObjectFileIdManager, transformMeshToObject } from './obj';
declare const osfs: any;
declare const Project: any;
declare const JSZip: any;
declare const pathToName: any;

export function createKasugaObjectCodec() : Codec{
    let _obj_export : {
        obj: string,
        mtl: string,
        images: Record<string, Texture>
    } = {
        obj: '',
        mtl: '',
        images: {}
    };
    return new Codec('kasuga_lib_object', {
        name: 'KasugaLib Wavefont Object',
        extension: 'obj',
        remember: false,
        compile(options){
            if (!options) options = {};
            options['mode'] =  Settings.get('obj_face_export_mode');
            options['scale'] =  Settings.get('model_export_scale');
            let scene_postion = new Vector3().copy(scene.position);
            let exporter = new KasugaObjectFileExporter();
            exporter.sample(options);
            scene.position.copy(scene_postion)
            let obj = exporter.getObjFile();
            _obj_export = {
                obj: obj,
                mtl: exporter.getMaterialFile(),
                images: exporter.materials
            };
            console.info(_obj_export)
            return obj
        },
        write(content, path) {
            var scope = this;
            var mtl_path = path.replace(/\.obj$/, '.mtl')
            content = this.compile({mtl_name: pathToName(mtl_path, true)})
            Blockbench.writeFile(path, {content}, path => scope.afterSave(path));

            Blockbench.writeFile(mtl_path, {content: _obj_export.mtl});

            //let existing_names = [];
            for (var key in _obj_export.images) {
                var texture = _obj_export.images[key]
                if (texture && !texture.error) {
                    var name = texture.name;
                    if (name.substring(-4) !== '.png') {
                        name += '.png';
                    }
                    var image_path = path.split(osfs);
                    image_path.splice(-1, 1, name);
                    Blockbench.writeFile(image_path.join(osfs), {
                        content: texture.source,
                        savetype: 'image'
                    })
                }
            }
        },
        export(){
            var scope = this;
            if (isApp) {
                Blockbench.export({
                    resource_id: 'obj',
                    type: this.name,
                    extensions: [this.extension],
                    name: this.fileName(),
                    custom_writer: (a, b) => scope.write(a, b),
                })

            } else {
                var archive = new JSZip();
                var content = this.compile()

                archive.file((Project.name||'model')+'.obj', content)
                archive.file('materials.mtl', _obj_export.mtl)

                for (var key in _obj_export.images) {
                    var texture = _obj_export.images[key]
                    if (texture && !texture.error && texture.mode === 'bitmap') {
                        archive.file(pathToName(texture.name) + '.png', texture.source.replace('data:image/png;base64,', ''), {base64: true});
                    }
                }
                archive.generateAsync({type: 'blob'}).then(content => {
                    Blockbench.export({
                        type: 'Zip Archive',
                        extensions: ['zip'],
                        name: 'assets',
                        content: content,
                        savetype: 'zip'
                    }, path => scope.afterDownload(path));
                })
            }
        }
    });
}


const cube_face_normals = {
	north: [0, 0, -1],
	east: [1, 0, 0],
	south: [0, 0, 1],
	west: [-1, 0, 0],
	up: [0, 1, 0],
	down: [0, -1, 0],
}

export class KasugaObjectFileExporter{
    getMaterialFile() {
        return this.mtlOutput.join('\n');
    }
    getObjFile() {
        return this.output.join('\n');
    }
    materials: Record<string, any> = {};
    output: string[] = ['# Made in Blockbench & KasugaLib'];
    mtlOutput: string[] = ['# Made in Blockbench & KasugaLib'];
    vertexIndex: number = 0;
    faceIndex: number = 0;
    normalIndex: number = 0;
    $vertex = new Vector3();
    $uv: Vector2 = new Vector2();
    $color: Color = new Color();
    face: number[] = [];

    sample(options: any) {
        const { write } = this.command;
        
        let oldScenePosition = new Vector3().copy(scene.position);
        scene.position.set(0, 0, 0);

        write `mtllib ${options.mtl_name || 'materials.mtl'}`;

        let supers : Map<string, THREEMesh[]> = new Map();

        let groupNames : Map<string, string> = new Map();

        let objectIds : Map<Group | "root" | undefined, string> = new Map();

        scene.traverse((child: any) => {
            if (child instanceof THREEMesh) {
                if(!child.name){
                    return;
                }
                var element  = OutlinerNode.uuids[child.name];
                if(!element)
                    return;
                if(!objectIds.has(element.parent)){
                    const id = nanoid(16);
                    objectIds.set(element.parent, id);
                    groupNames.set(id, element.parent == "root" ? "root" : element.parent?.name || `group_${id}`);
                }
                let parentId = objectIds.get(element.parent)!;
                if(!supers.has(parentId)){
                    supers.set(parentId, []);
                }
                supers.get(parentId)!.push(child);
            }
        });
        let idManager = new ObjectFileIdManager();

        supers.forEach((meshes, superId)=>{
            let superName = groupNames.get(superId) || `super_${superId}`;
            write `o ${superName}`;
            let meshContext = {
                internalVertex: 0,
                internalFace: 0,
                internalNormal: 0,
                exportScale: options['scale'],
                exportMode: options['mode']
            };
            let {materials} = transformMeshToObject(meshes, meshContext, this.command, idManager);
            Object.entries(materials).forEach(([id, material])=>{
                if(!this.materials[material.uuid]){
                    this.materials[material.uuid] = material;
                }
            });
        })

        this.generateMTL();

        scene.position.copy(oldScenePosition);
    }

    generateMTL() {
        this.mtlOutput = ['# Made in Blockbench & KasugaLib'];
        const { material } = this.command;
        
        for (let key in this.materials) {
            if (this.materials.hasOwnProperty(key) && this.materials[key]) {
                const tex = this.materials[key];
                let name = tex.name;
                
                if (!name.endsWith('.png')) {
                    name += '.png';
                }
                
                material `newmtl m_${key}`;
                material `map_Kd ${name}`;
                material ``;
            }
        }
        
        material `newmtl none`
    }

    get command(){
        return {
            write: (template:any, ...args:any[])=>this._write(String.raw(template, ...args)),
            material: (template:any, ...args:any[])=>this._writeMaterial(String.raw(template, ...args)),
            vertex: (v: Vector3)=>this.vertex(v),
        };
    }

    vertex(v: Vector3){
        this.vertexIndex++;
        this._write(`v ${v.x} ${v.y} ${v.z}`);
    }

    _write(string:any){
        this.output.push(string);
    }

    _writeMaterial(material: string){
        this.mtlOutput.push(material);
    }
}