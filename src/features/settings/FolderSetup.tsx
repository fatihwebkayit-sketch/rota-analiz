import { useApp } from '../../state/store';
import { tr } from '../../i18n/tr';

/** İlk açılışta veri klasörü seçimi (yalnızca klasör desteklenen ve henüz seçilmemiş durumda). */
export function FolderSetup() {
  const { folderState, folderSetupSeen, chooseFolder, dismissFolderSetup, records } = useApp();
  if (folderSetupSeen || folderState !== 'none') return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-950/75">
      <div className="w-[min(520px,92vw)] rounded-[4px] border border-ink-600 bg-ink-850 p-5 shadow-2xl">
        <h2 className="text-[15px] font-semibold">{tr.folder.title}</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">{tr.folder.body}</p>
        <div className="mt-3 rounded-[3px] border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-[11.5px] text-fg">{tr.folder.hint}</div>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-[12px] text-fg-muted">
          <li>“Veri klasörü seç” düğmesine basın.</li>
          <li>Google Drive içinde <span className="text-fg">Rotalarım</span> adında bir klasör oluşturup seçin.</li>
          <li>Chrome “düzenleme izni” sorduğunda <span className="text-fg">İzin ver</span> deyin.</li>
        </ol>
        <p className="mt-3 text-[11.5px] text-fg-faint">Ofis bilgisayarında aynı klasörü seçtiğinizde kayıtlarınız orada da görünür.{records.length ? ` Bu tarayıcıdaki ${records.length} kayıt klasöre taşınır.` : ''}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="ra-btn" onClick={dismissFolderSetup}>{tr.folder.later}</button>
          <button className="ra-btn-primary" onClick={chooseFolder}>{tr.actions.chooseFolder}</button>
        </div>
      </div>
    </div>
  );
}
