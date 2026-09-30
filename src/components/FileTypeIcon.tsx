import TablerIcon from './TablerIcon';

export default function FileTypeIcon({ name, kind, className = 'text-xl' }: { name: string; kind?: string; className?: string }) {
    const ext = name.toLowerCase().split('.').pop() || '';
    const icon = kind === 'folder'
        ? 'folder'
        : ext === 'pdf'
            ? 'file_type_pdf'
            : ['doc', 'docx'].includes(ext)
                ? 'file_type_doc'
                : ['xls', 'xlsx', 'xlsm'].includes(ext)
                    ? 'file_type_xls'
                    : ['ppt', 'pptx'].includes(ext)
                        ? 'file_type_ppt'
                        : ['zip','rar','7z','gz'].includes(ext)
                            ? 'folder_zip'
                            : ['png','jpg','jpeg','gif','webp','svg'].includes(ext)
                                ? 'image'
                                : ['mp4','webm','mov'].includes(ext)
                                    ? 'movie'
                                    : ['mp3','wav','ogg'].includes(ext)
                                        ? 'audio_file'
                                        : ['csv','tsv'].includes(ext)
                                            ? 'csv'
                                            : ext === 'js'
                                                ? 'javascript'
                                                : ext === 'json'
                                                    ? 'json'
                                                    : ['ts','html','css','py'].includes(ext)
                                                        ? 'code'
                                                        : 'description';
    return <TablerIcon name={icon} className={`${className} theme-text-faint`} />;
}
