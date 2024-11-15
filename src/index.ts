import 'blockbench-types'
import { createKasugaObjectCodec } from './codec';
let rootSideEffect : null | (()=>void) = null;
BBPlugin.register('kasuga_object', {
    title: 'Kasuga OBJ Wavefront Model',
    author: 'KasugaTeam',
    description: 'Export Kasuga OBJ Wavefront Model',
    icon: 'barchart',
    version: '1.0.0',
    variant: 'both',
    onload(){
        rootSideEffect = createPlugin();
    },
    onunload(){
        if(rootSideEffect){
            rootSideEffect();
            rootSideEffect = null;
        }
    }
})

function createPlugin(){
    const codec = createKasugaObjectCodec();
    codec.export_action = new Action('export_kasuga_object',{
        icon: 'icon-objects',
        category: 'file',
        name: 'Export Kasuga Object',
        click: function () {
            codec.export()
        }
    })

    MenuBar.addAction(codec.export_action, "file.export");

    return () => {
        codec.export_action!.delete();
    }
}