import 'dart:async';
import 'dart:io';

import 'package:flutter_contacts/flutter_contacts.dart' as contacts;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import 'navigation_policy.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const AlAlamiAqaratApp());
}

class AlAlamiAqaratApp extends StatelessWidget {
  const AlAlamiAqaratApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'بورصة العالمي الدولية للأصول والعقارات',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFD4AF37),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF090D16),
        useMaterial3: true,
      ),
      home: const PlatformWebView(),
    );
  }
}

class PlatformWebView extends StatefulWidget {
  const PlatformWebView({super.key});

  @override
  State<PlatformWebView> createState() => _PlatformWebViewState();
}

class _PlatformWebViewState extends State<PlatformWebView> {
  late final WebViewController _controller;
  bool _isLoading = true;
  String? _loadError;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController(
      onPermissionRequest: _handleWebPermissionRequest,
    );
    unawaited(_initializeWebView());
  }

  Future<void> _initializeWebView() async {
    try {
      await _controller.setJavaScriptMode(JavaScriptMode.unrestricted);
      await _controller.setBackgroundColor(const Color(0xFF090D16));
      await _controller.setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            if (!mounted) return;
            setState(() {
              _isLoading = true;
              _loadError = null;
            });
          },
          onPageFinished: (_) {
            if (!mounted) return;
            setState(() => _isLoading = false);
          },
          onWebResourceError: (error) {
            if (error.isForMainFrame != false && mounted) {
              setState(() {
                _isLoading = false;
                _loadError = 'تعذر تحميل المنصة. تحقق من اتصال الإنترنت وحاول مجدداً.';
              });
            }
          },
          onNavigationRequest: _handleNavigationRequest,
        ),
      );
      await _configureAndroidGeolocation();
      await _controller.loadRequest(Uri.https(platformHost, '/'));
    } catch (error, stackTrace) {
      debugPrint('WebView initialization failed: $error\n$stackTrace');
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _loadError = 'تعذر تشغيل المنصة داخل التطبيق.';
      });
    }
  }

  Future<void> _configureAndroidGeolocation() async {
    if (!Platform.isAndroid) return;

    final controller = _controller.platform as AndroidWebViewController;
    await controller.setGeolocationEnabled(true);
    await controller.setGeolocationPermissionsPromptCallbacks(
      onShowPrompt: (request) async {
        final origin = Uri.tryParse(request.origin);
        if (origin == null || !isFirstPartyUri(origin)) {
          return const GeolocationPermissionsResponse(
            allow: false,
            retain: false,
          );
        }

        final status = await Permission.locationWhenInUse.request();
        return GeolocationPermissionsResponse(
          allow: status.isGranted,
          retain: status.isGranted,
        );
      },
    );
  }

  Future<void> _handleWebPermissionRequest(
    WebViewPermissionRequest request,
  ) async {
    try {
      final currentUrl = await _controller.currentUrl();
      final origin = Uri.tryParse(currentUrl ?? '');
      const supportedTypes = {
        WebViewPermissionResourceType.camera,
        WebViewPermissionResourceType.microphone,
      };
      if (origin == null ||
          !isFirstPartyUri(origin) ||
          request.types.isEmpty ||
          !request.types.every(supportedTypes.contains)) {
        await request.deny();
        return;
      }

      final permissions = <Permission>[
        if (request.types.contains(WebViewPermissionResourceType.camera))
          Permission.camera,
        if (request.types.contains(WebViewPermissionResourceType.microphone))
          Permission.microphone,
      ];
      final statuses = await permissions.request();
      if (statuses.values.every((status) => status.isGranted)) {
        await request.grant();
      } else {
        await request.deny();
      }
    } catch (error, stackTrace) {
      debugPrint('WebView permission request failed: $error\n$stackTrace');
      await request.deny();
    }
  }

  Future<NavigationDecision> _handleNavigationRequest(
    NavigationRequest request,
  ) async {
    final uri = Uri.tryParse(request.url);
    if (uri == null) return NavigationDecision.prevent;

    if (shouldOpenExternally(uri)) {
      await _openExternal(uri);
      return NavigationDecision.prevent;
    }

    if (uri.scheme == 'https' || uri.scheme == 'about') {
      return NavigationDecision.navigate;
    }
    return NavigationDecision.prevent;
  }

  Future<void> _openExternal(Uri uri) async {
    try {
      final launched = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (!launched && mounted) {
        _showMessage('لا يوجد تطبيق متاح لفتح هذا الرابط.');
      }
    } catch (error, stackTrace) {
      debugPrint('External link launch failed: $error\n$stackTrace');
      if (mounted) _showMessage('تعذر فتح الرابط في التطبيق الخارجي.');
    }
  }

  Future<void> _handleSystemBack() async {
    if (await _controller.canGoBack()) {
      await _controller.goBack();
    } else {
      await SystemNavigator.pop();
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _inviteContact() async {
    try {
      if (Platform.isAndroid) {
        final permission = await contacts.FlutterContacts.permissions.request(
          contacts.PermissionType.read,
        );
        if (permission != contacts.PermissionStatus.granted) {
          if (mounted) _showMessage('يلزم السماح بقراءة جهة الاتصال التي تختارها.');
          return;
        }
      }

      final contact = await contacts.FlutterContacts.native.showPicker(
        properties: {contacts.ContactProperty.phone},
      );
      if (!mounted || contact == null) return;
      final phone = contact.phones
          .map((entry) => entry.number.trim())
          .firstWhere((number) => number.isNotEmpty, orElse: () => '');
      if (phone.isEmpty) {
        _showMessage('جهة الاتصال المختارة لا تحتوي على رقم هاتف.');
        return;
      }

      final invite = Uri.https(platformHost, '/');
      final name = contact.displayName?.trim();
      final greeting = name == null || name.isEmpty ? '' : ' $name';
      final message =
          'أدعوك لاكتشاف بورصة العالمي الدولية للأصول والعقارات VIP للعقارات والمنتجات والفرص الاستثمارية. تابع المنصة وحمّل التطبيق من الرابط: $invite';
      await showModalBottomSheet<void>(
        context: context,
        builder: (context) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('إرسال دعوة إلى$greeting'),
                const SizedBox(height: 12),
                SelectableText(message),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: () async {
                    await Clipboard.setData(ClipboardData(text: message));
                    if (context.mounted) Navigator.pop(context);
                    if (mounted) _showMessage('تم نسخ رسالة الدعوة.');
                  },
                  icon: const Icon(Icons.copy),
                  label: const Text('نسخ رسالة الدعوة'),
                ),
                OutlinedButton.icon(
                  onPressed: () => _openInviteTarget(
                    Uri(
                      scheme: 'sms',
                      path: phone,
                      queryParameters: {'body': message},
                    ),
                  ),
                  icon: const Icon(Icons.sms_outlined),
                  label: const Text('إرسال برسالة SMS'),
                ),
                OutlinedButton.icon(
                  onPressed: () {
                    final digits = phone.replaceAll(RegExp(r'\D'), '');
                    final international =
                        digits.startsWith('0') ? '966${digits.substring(1)}' : digits;
                    _openInviteTarget(
                      Uri.https('wa.me', '/$international', {'text': message}),
                    );
                  },
                  icon: const Icon(Icons.chat_outlined),
                  label: const Text('فتح WhatsApp'),
                ),
              ],
            ),
          ),
        ),
      );
    } catch (error, stackTrace) {
      debugPrint('Contact invite failed: $error\n$stackTrace');
      if (mounted) _showMessage('تعذر فتح جهة الاتصال أو إعداد الدعوة.');
    }
  }

  Future<void> _openInviteTarget(Uri uri) async {
    try {
      final launched = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (!launched && mounted) {
        _showMessage('لا يوجد تطبيق مراسلة متاح؛ انسخ رسالة الدعوة بدلاً من ذلك.');
      }
    } catch (error, stackTrace) {
      debugPrint('Invite target launch failed: $error\n$stackTrace');
      if (mounted) _showMessage('تعذر فتح تطبيق المراسلة.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope<void>(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) unawaited(_handleSystemBack());
      },
      child: Scaffold(
        floatingActionButton: FloatingActionButton.extended(
          onPressed: _inviteContact,
          backgroundColor: const Color(0xFFD4AF37),
          foregroundColor: const Color(0xFF090D16),
          icon: const Icon(Icons.person_add_alt_1),
          label: const Text('دعوة جهة اتصال'),
        ),
        body: SafeArea(
          top: false,
          bottom: false,
          child: Stack(
            fit: StackFit.expand,
            children: [
              WebViewWidget(controller: _controller),
              if (_isLoading)
                const Align(
                  alignment: Alignment.topCenter,
                  child: LinearProgressIndicator(
                    color: Color(0xFFD4AF37),
                    backgroundColor: Color(0xFF090D16),
                  ),
                ),
              if (_loadError case final error?)
                ColoredBox(
                  color: const Color(0xFF090D16),
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.wifi_off_rounded,
                            color: Color(0xFFD4AF37),
                            size: 44,
                          ),
                          const SizedBox(height: 16),
                          Text(error, textAlign: TextAlign.center),
                          const SizedBox(height: 16),
                          FilledButton.icon(
                            onPressed: () {
                              setState(() {
                                _loadError = null;
                                _isLoading = true;
                              });
                              unawaited(_controller.reload());
                            },
                            icon: const Icon(Icons.refresh),
                            label: const Text('إعادة المحاولة'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
