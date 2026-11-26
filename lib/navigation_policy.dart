const String platformHost = 'alalami-aqaratcom.onrender.com';

bool isFirstPartyUri(Uri uri) =>
    uri.scheme == 'https' && uri.host.toLowerCase() == platformHost;

bool shouldOpenExternally(Uri uri) {
  if (uri.scheme == 'tel') {
    return RegExp(r'^\+?[0-9(). -]+$').hasMatch(uri.path);
  }
  if (uri.scheme == 'sms') {
    return RegExp(r'^\+?[0-9(). -]+$').hasMatch(uri.path);
  }
  if (uri.scheme != 'https') return false;

  final host = uri.host.toLowerCase();
  return host == 'wa.me' ||
      host == 'whatsapp.com' ||
      host.endsWith('.whatsapp.com') ||
      host == 'zoom.us' ||
      host.endsWith('.zoom.us') ||
      host == 'meet.google.com' ||
      host == 'snapchat.com' ||
      host.endsWith('.snapchat.com') ||
      host == 'instagram.com' ||
      host.endsWith('.instagram.com') ||
      host == 'twitter.com' ||
      host.endsWith('.twitter.com') ||
      host == 'x.com' ||
      host.endsWith('.x.com') ||
      host == 'imo.im' ||
      host.endsWith('.imo.im');
}
