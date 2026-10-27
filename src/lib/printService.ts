import jsPDF from 'jspdf';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Universal Quick Print function that works across all devices:
 * - Android APK (phones & tablets):
 *    1. Uses Android Native PrintManager if available via window.AndroidNativePrint (native print spooler).
 *    2. Otherwise writes PDF to cache/storage and invokes native Android Share sheet (with built-in Print & PDF viewer).
 * - Mobile web browsers (Chrome Android, Safari iOS):
 *    Opens PDF blob in a new window/tab to trigger mobile viewer print.
 * - Desktop browsers:
 *    Uses autoPrint with an invisible iframe and fallback window.
 */
export async function universalQuickPrintPdf(
  doc: jsPDF,
  fileName: string = 'document.pdf',
  documentTitle?: string
): Promise<void> {
  const cleanTitle = documentTitle || fileName.replace(/\.pdf$/i, '').replace(/_/g, ' ');
  const cleanFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;

  // 1. Android Native Print Interface (available in compiled APK via MainActivity)
  if (typeof window !== 'undefined' && (window as any).AndroidNativePrint?.printPdf) {
    try {
      const dataUri = doc.output('datauristring');
      const base64Data = dataUri.split(',')[1] || dataUri;
      (window as any).AndroidNativePrint.printPdf(base64Data, cleanTitle);
      return;
    } catch (androidErr) {
      console.warn('AndroidNativePrint invocation failed, falling back to Capacitor Share...', androidErr);
    }
  }

  // 2. Native Capacitor Platform (Android / iOS APK or App on mobile or tablet)
  const isNative = Capacitor.isNativePlatform();
  if (isNative) {
    try {
      const dataUri = doc.output('datauristring');
      const base64Data = dataUri.split(',')[1] || dataUri;

      let fileUri: string | null = null;
      try {
        const cacheRes = await Filesystem.writeFile({
          path: cleanFileName,
          data: base64Data,
          directory: Directory.Cache,
          recursive: true
        });
        fileUri = cacheRes.uri;
      } catch (cacheErr) {
        console.warn('Cache write failed, trying Documents directory...', cacheErr);
        try {
          const docRes = await Filesystem.writeFile({
            path: cleanFileName,
            data: base64Data,
            directory: Directory.Documents,
            recursive: true
          });
          fileUri = docRes.uri;
        } catch (docErr) {
          console.warn('Documents write failed, trying ExternalStorage...', docErr);
          const extRes = await Filesystem.writeFile({
            path: cleanFileName,
            data: base64Data,
            directory: Directory.ExternalStorage,
            recursive: true
          });
          fileUri = extRes.uri;
        }
      }

      if (fileUri) {
        // Android and iOS share dialog includes native "Print" service and default PDF apps
        await Share.share({
          title: cleanTitle,
          text: `Print ${cleanTitle}`,
          url: fileUri,
          dialogTitle: `Print ${cleanTitle}`
        });
        return;
      }
    } catch (nativeErr) {
      console.error('Native mobile/tablet print failed, falling back...', nativeErr);
    }
  }

  // 3. Mobile Web Browser (Android Chrome, iOS Safari, tablets)
  const isMobileBrowser = typeof navigator !== 'undefined' && 
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (isMobileBrowser) {
    try {
      const blob = doc.output('blob');
      const blobUrl = URL.createObjectURL(blob);
      const newWin = window.open(blobUrl, '_blank');
      if (newWin) {
        setTimeout(() => {
          try {
            newWin.focus();
            newWin.print();
          } catch {
            // Mobile browser displays the PDF with its built-in Print button
          }
        }, 500);
        return;
      }
    } catch (mobileWebErr) {
      console.warn('Mobile web window.open failed:', mobileWebErr);
    }
  }

  // 4. Desktop Web Browser (Iframe AutoPrint)
  try {
    doc.autoPrint();
    const blobUrl = String(doc.output('bloburl'));

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.src = blobUrl;
    document.body.appendChild(iframe);

    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          window.open(blobUrl, '_blank');
        }
      }, 350);

      setTimeout(() => {
        try {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
          URL.revokeObjectURL(blobUrl);
        } catch {}
      }, 60000);
    };
  } catch (err) {
    console.error('Universal quick print iframe error:', err);
    try {
      doc.save(cleanFileName);
    } catch (saveErr) {
      console.error('Final fallback save failed:', saveErr);
    }
  }
}
