package ru.neonroyale.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * NEON ROYALE — MainActivity.
 *
 * Защита от «вылетает при входе»:
 *  1. Любой сбой при инициализации WebView/Capacitor ловится и показывается
 *     понятное окно с инструкцией (обновить Android System WebView),
 *     вместо молчаливого краха приложения.
 *  2. Перед запуском проверяется версия Android System WebView: если она
 *     слишком старая — игрок сразу видит инструкцию, а не чёрный экран.
 *  3. Текст любой ошибки пишется в файл nr-crash.log на устройстве —
 *     его можно прислать разработчику.
 *  4. Иммерсивный полноэкранный режим без статус-бара.
 */
public class MainActivity extends BridgeActivity {

    private boolean crashed = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        keepScreenOn();
        try {
            super.onCreate(savedInstanceState);
        } catch (Throwable t) {
            crashed = true;
            saveCrashLog(t);
            showRecoveryDialog(
                "Не удалось запустить игру",
                "Похоже, на телефоне устарела системная компонента WebView.\n\n" +
                "Как исправить:\n" +
                "1. Открой Play Маркет (или RuStore)\n" +
                "2. Найди «Android System WebView»\n" +
                "3. Нажми «Обновить»\n" +
                "4. Перезагрузи телефон и запусти игру снова\n\n" +
                "Если не помогло — напиши разработчику и приложь файл nr-crash.log",
                throwableToString(t)
            );
            return;
        }
        applyImmersive();
    }

    @Override
    public void onStart() {
        try {
            super.onStart();
        } catch (Throwable t) {
            crashed = true;
            saveCrashLog(t);
            showRecoveryDialog("Ошибка запуска", "Приложение не смогло стартовать. Обнови Android System WebView и перезапусти игру.", throwableToString(t));
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        if (!crashed) {
            checkWebViewVersion();
            applyImmersive();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && !crashed) applyImmersive();
    }

    private void keepScreenOn() {
        try {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } catch (Throwable ignored) {
        }
    }

    /** Полноэкранный иммерсивный режим (как в старой версии APK). */
    @SuppressLint("InlinedApi")
    private void applyImmersive() {
        try {
            View decor = getWindow().getDecorView();
            decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        } catch (Throwable ignored) {
            // на некоторых прошивках флаги недоступны — не критично
        }
    }

    /**
     * WebView младше 60 версии не умеет исполнять современный JS игры.
     * Capacitor при этом может крашиться — предупредим заранее.
     */
    private void checkWebViewVersion() {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return;
            PackageInfo pv = WebView.getCurrentWebViewPackage();
            if (pv == null) return; // не смогли определить — работаем дальше
            String version = pv.versionName == null ? "0" : pv.versionName;
            int major;
            try {
                major = Integer.parseInt(version.split("\\.")[0]);
            } catch (NumberFormatException e) {
                return;
            }
            if (major > 0 && major < 60) {
                showRecoveryDialog(
                    "Нужно обновить WebView",
                    "На телефоне установлена очень старая версия Android System WebView (" + version + ").\n\n" +
                    "Игра может работать нестабильно или не запускаться.\n\n" +
                    "Открой Play Маркет → «Android System WebView» → «Обновить», затем перезапусти игру.",
                    null);
            }
        } catch (Throwable ignored) {
            // любые странности прошивки не должны мешать игре
        }
    }

    /** Показ окна восстановления вместо тихого вылета. */
    private void showRecoveryDialog(final String title, final String message, final String details) {
        try {
            final Activity act = this;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        AlertDialog.Builder b = new AlertDialog.Builder(act);
                        b.setTitle(title)
                         .setMessage(message)
                         .setPositiveButton("Понятно", new DialogInterface.OnClickListener() {
                             @Override
                             public void onClick(DialogInterface d, int w) {
                                 d.dismiss();
                             }
                         })
                         .setCancelable(true);
                        if (details != null) {
                            b.setNeutralButton("Показать детали", new DialogInterface.OnClickListener() {
                                @Override
                                public void onClick(DialogInterface d, int w) {
                                    AlertDialog.Builder db = new AlertDialog.Builder(act);
                                    db.setTitle("Техническая информация")
                                      .setMessage(details.length() > 3500 ? details.substring(0, 3500) : details)
                                      .setPositiveButton("Закрыть", null)
                                      .show();
                                }
                            });
                        }
                        b.show();
                    } catch (Throwable ignored) {
                        // даже диалог показать не смогли — остаётся только лог
                    }
                }
            });
        } catch (Throwable ignored) {
        }
    }

    /** Пишем ошибку в файл, чтобы игрок мог её переслать разработчику. */
    private void saveCrashLog(Throwable t) {
        try {
            File dir = getExternalFilesDir(null);
            if (dir == null) dir = getFilesDir();
            if (dir == null) return;
            File log = new File(dir, "nr-crash.log");
            StringWriter sw = new StringWriter();
            t.printStackTrace(new PrintWriter(sw));
            String body = "=== Neon Royale crash " +
                new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date()) +
                " ===\ndevice: " + Build.MANUFACTURER + " " + Build.MODEL +
                " (Android " + Build.VERSION.RELEASE + ", SDK " + Build.VERSION.SDK_INT + ")\n" +
                sw.toString() + "\n";
            FileOutputStream fos = new FileOutputStream(log, true);
            fos.write(body.getBytes("UTF-8"));
            fos.close();
        } catch (Throwable ignored) {
        }
    }

    private static String throwableToString(Throwable t) {
        try {
            StringWriter sw = new StringWriter();
            t.printStackTrace(new PrintWriter(sw));
            return sw.toString();
        } catch (Throwable ignored) {
            return t == null ? "unknown" : String.valueOf(t);
        }
    }
}
