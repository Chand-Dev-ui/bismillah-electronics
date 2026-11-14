const $=id=>document.getElementById(id),cfg=window.SUPABASE_CONFIG||{};
const configured=cfg.url&&cfg.anonKey&&!cfg.url.includes("PASTE_")&&!cfg.anonKey.includes("PASTE_");
const sb=configured?window.supabase.createClient(cfg.url,cfg.anonKey):null;
let products=[],editingId=null,selectedFiles=[],currentUser=null;
const money=n=>"Rs. "+Number(n).toLocaleString("en-PK");
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function say(m){$("loginMessage").textContent=m;}
async function checkSession(){
 if(!sb){say("Please create config.js from config.js.example and add your Supabase Project URL and Publishable Key.");return;}
 const {data:{session}}=await sb.auth.getSession();if(session)await verifyAdmin(session.user);
}
async function verifyAdmin(user){
 const {data:profile,error}=await sb.from("profiles").select("role").eq("id",user.id).single();
 if(error||!profile||!["main_admin","sub_admin"].includes(profile.role)){say("This account is not an admin. Ask the project owner to grant admin access in Supabase SQL Editor.");await sb.auth.signOut();return;}
 currentUser=user;$("loginPanel").classList.add("hidden");$("dashboard").classList.remove("hidden");$("setupNotice").classList.add("hidden");$("adminIdentity").textContent="Signed in: "+user.email+" ("+profile.role+")";await loadProducts();await loadOrders();await loadDeliveryCharges();await loadMessages();await loadReviews();
}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();if(!sb){say("Supabase config missing.");return;}say("Signing in...");const {data,error}=await sb.auth.signInWithPassword({email:$("email").value,password:$("password").value});if(error){say(error.message);return;}await verifyAdmin(data.user);});
$("signOut").onclick=async()=>{await sb.auth.signOut();location.reload();};
async function loadProducts(){const {data,error}=await sb.from("products").select("*").order("created_at",{ascending:false});if(error){say("Products could not load: "+error.message);return;}products=data||[];render();}

async function loadOrders(){
 const box=$("ordersList"),msg=$("ordersMessage");
 if(!currentUser){box.innerHTML="<p>Please sign in as an admin to view orders.</p>";return;}
 box.innerHTML="<p>Loading orders...</p>";msg.textContent="";
 const {data,error}=await sb.from("orders").select("id,customer_name,phone,email,address,city,payment_method,subtotal,delivery_fee,status,created_at,order_items(product_name,quantity,unit_price)").order("created_at",{ascending:false}).limit(100);
 if(error){box.innerHTML="<p>Orders could not load.</p>";msg.textContent="Error: "+error.message;return;}
 if(!data||!data.length){box.innerHTML="<p>No orders found yet. Place a test order while signed in as a customer.</p>";return;}
 box.innerHTML=data.map(o=>{
  const total=Number(o.subtotal||0)+Number(o.delivery_fee||0);
  const items=(o.order_items||[]).map(i=>`${esc(i.product_name)} × ${Number(i.quantity)} — ${money(Number(i.unit_price)*Number(i.quantity))}`).join("<br>")||"No order items returned";
  const when=new Date(o.created_at).toLocaleString();
  return `<article class="admin-product" style="display:block"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><b>Order #${esc(o.id)}</b><b>${money(total)}</b></div><small>${esc(when)} · ${esc(o.payment_method)}</small><p style="font-size:12px;line-height:1.6;margin:8px 0"><b>${esc(o.customer_name)}</b> · ${esc(o.phone)}<br>${esc(o.address)}, ${esc(o.city)}<br>${items}</p><small>Subtotal: ${money(o.subtotal)} · Delivery: ${money(o.delivery_fee)}</small><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px"><label>Status <select id="status-${esc(o.id)}"><option ${o.status==='pending'?'selected':''}>pending</option><option ${o.status==='confirmed'?'selected':''}>confirmed</option><option ${o.status==='packed'?'selected':''}>packed</option><option ${o.status==='shipped'?'selected':''}>shipped</option><option ${o.status==='delivered'?'selected':''}>delivered</option><option ${o.status==='cancelled'?'selected':''}>cancelled</option></select></label><button class="admin-btn secondary" onclick="updateOrderStatus('${esc(o.id)}')">Update status</button></div></article>`;
 }).join("");
}
$("refreshOrders").addEventListener("click",loadOrders);

function render(){$("productList").innerHTML=products.map(p=>`<div class="admin-product">${p.image_urls?.[0]?`<img src="${esc(p.image_urls[0])}" alt="">`:""}<div class="meta"><b>${esc(p.name)}</b><small>${esc(p.brand)} · ${money(p.price)} · Stock: ${p.stock} · ${p.is_active?"Active":"Hidden"}</small></div><button class="admin-btn secondary" onclick="editProduct('${p.id}')">Edit</button><button class="admin-btn danger" onclick="deleteProduct('${p.id}')">Delete</button></div>`).join("")||"<p>No products yet. Add your first phone.</p>";}
$("image").onchange=e=>{selectedFiles=[...e.target.files];if(selectedFiles.length>5||selectedFiles.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>5*1024*1024)){alert("Choose up to 5 JPG, PNG or WebP images, each under 5 MB.");selectedFiles=[];e.target.value="";return;}if(selectedFiles[0]){const r=new FileReader();r.onload=()=>{$("preview").src=r.result;$("preview").style.display="block";};r.readAsDataURL(selectedFiles[0]);}};
$("productForm").onsubmit=async e=>{e.preventDefault();if(!currentUser)return;const old=products.find(p=>p.id===editingId);
 try{
  let imageUrls=old?.image_urls||[];if(selectedFiles.length){imageUrls=[];for(const selectedFile of selectedFiles){const ext=(selectedFile.name.split(".").pop()||"jpg").replace(/[^a-z0-9]/gi,"");const path=`${currentUser.id}/${crypto.randomUUID()}.${ext}`;const {error:upErr}=await sb.storage.from("product-images").upload(path,selectedFile,{upsert:false,contentType:selectedFile.type});if(upErr)throw upErr;const {data}=sb.storage.from("product-images").getPublicUrl(path);imageUrls.push(data.publicUrl);}}
  const row={name:$("name").value.trim(),brand:$("brand").value.trim(),category:$("category").value.trim()||"Smartphones",price:Number($("price").value),original_price:Number($("originalPrice").value)||null,ram:$("ram").value||null,storage:$("storage").value||null,network:$("network").value||null,stock:Number($("stock").value)||0,description:$("description").value.trim(),image_urls:imageUrls,is_active:true};
  const result=editingId?await sb.from("products").update(row).eq("id",editingId):await sb.from("products").insert(row);
  if(result.error)throw result.error;resetForm();await loadProducts();say("Product saved successfully.");
 }catch(err){say("Save failed: "+err.message);}
};
function editProduct(id){const p=products.find(x=>x.id===id);if(!p)return;editingId=id;selectedFiles=[];for(const k of ["name","brand","category","price","ram","storage","network","stock","description"])$(k).value=p[k]??"";$("originalPrice").value=p.original_price??"";$("preview").src=p.image_urls?.[0]||"";$("preview").style.display=p.image_urls?.[0]?"block":"none";$("formHeading").textContent="Edit product";$("saveBtn").textContent="Update product";$("cancelEdit").classList.remove("hidden");window.scrollTo({top:0,behavior:"smooth"});}
async function deleteProduct(id){if(!confirm("Delete this product from the online store?"))return;const {error}=await sb.from("products").delete().eq("id",id);if(error){say(error.message);return;}await loadProducts();}
function resetForm(){editingId=null;selectedFiles=[];$("productForm").reset();$("stock").value=1;$("preview").style.display="none";$("formHeading").textContent="Add a product";$("saveBtn").textContent="Save product";$("cancelEdit").classList.add("hidden");}
$("cancelEdit").onclick=resetForm;checkSession();

async function updateOrderStatus(id){const status=document.getElementById('status-'+id)?.value;if(!status)return;const {error}=await sb.from('orders').update({status}).eq('id',id);if(error){$('ordersMessage').textContent='Status update failed: '+error.message;return}$('ordersMessage').textContent='Order status updated.';await loadOrders();}
async function loadDeliveryCharges(){const box=$('deliveryList');if(!box)return;if(currentUser){const {data:profile}=await sb.from('profiles').select('role').eq('id',currentUser.id).single();if(profile?.role!=='main_admin'){$('deliveryForm').classList.add('hidden');$('deliveryMessage').textContent='Only the Main Admin can change delivery pricing.';}}
 const {data,error}=await sb.from('city_delivery_charges').select('*').order('city');if(error){box.textContent='Delivery charges could not load: '+error.message;return}box.innerHTML=(data||[]).map(x=>`<div class="admin-product"><div class="meta"><b>${esc(x.city)}</b><small>${money(x.fee)} · ${x.estimated_days} delivery day(s)</small></div></div>`).join('')||'No city charges set yet. Unlisted cities currently have zero fee.';}
$('deliveryForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!currentUser)return;const {data:profile}=await sb.from('profiles').select('role').eq('id',currentUser.id).single();if(profile?.role!=='main_admin'){$('deliveryMessage').textContent='Main Admin permission required.';return}const row={city:$('deliveryCity').value.trim(),fee:Number($('deliveryFee').value),estimated_days:Number($('deliveryDays').value)};const {error}=await sb.from('city_delivery_charges').upsert(row,{onConflict:'city'});$('deliveryMessage').textContent=error?'Save failed: '+error.message:'Delivery charge saved.';if(!error){$('deliveryForm').reset();$('deliveryDays').value=3;await loadDeliveryCharges();}});
async function loadMessages(){const box=$('messagesList');if(!box||!currentUser)return;const {data,error}=await sb.from('contact_messages').select('*').order('created_at',{ascending:false}).limit(100);if(error){box.textContent='Messages could not load: '+error.message;return}box.innerHTML=(data||[]).map(m=>`<article class="admin-product" style="display:block"><b>${esc(m.name)}</b> · ${esc(m.phone||m.email||'No contact')}<small>${esc(new Date(m.created_at).toLocaleString())}</small><p>${esc(m.message)}</p></article>`).join('')||'No customer messages.';}
$('refreshMessages')?.addEventListener('click',loadMessages);

async function loadReviews(){const box=$('reviewsList');if(!box||!currentUser)return;const {data,error}=await sb.from('reviews').select('id,rating,review_text,is_approved,created_at,products(name)').order('created_at',{ascending:false}).limit(100);if(error){box.textContent='Reviews could not load: '+error.message;return}box.innerHTML=(data||[]).map(r=>`<article class="admin-product" style="display:block"><b>${esc(r.products?.name||'Product')} · ${r.rating}/5</b><p>${esc(r.review_text||'No written comment')}</p><small>${r.is_approved?'Approved':'Pending approval'} · ${new Date(r.created_at).toLocaleString()}</small><div style="margin-top:8px"><button class="admin-btn secondary" onclick="moderateReview('${r.id}',${!r.is_approved})">${r.is_approved?'Unpublish':'Approve'}</button></div></article>`).join('')||'No reviews yet.';}
async function moderateReview(id,approved){const {error}=await sb.from('reviews').update({is_approved:approved}).eq('id',id);$('reviewsStatus').textContent=error?'Update failed: '+error.message:'Review moderation saved.';if(!error)await loadReviews();}
$('refreshReviews')?.addEventListener('click',loadReviews);
