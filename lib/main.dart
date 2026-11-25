import 'dart:async';
import 'dart:io';

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

  @override
  Widget build(BuildContext context) {
    return PopScope<void>(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) unawaited(_handleSystemBack());
      },
      child: Scaffold(
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
